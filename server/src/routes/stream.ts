import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { fetch as undiciFetch, Agent, ProxyAgent, type Dispatcher } from 'undici';
import { config } from '../config.js';
import {
  beginTicketTransfer,
  endTicketTransfer,
  getStreamTicket,
} from '../services/streamTickets.js';
import { detectPlatform } from '../services/platform.js';
import { logger } from '../utils/logger.js';

export const streamRouter = Router();

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * googlevideo throttles full-file GETs to roughly playback speed after an
 * initial burst, but serves Range chunks at full speed (yt-dlp uses the same
 * trick via http_chunk_size). The loopback relay below fetches upstream in
 * chunks so ffmpeg — which only does single full-file GETs — is never the one
 * talking to the CDN.
 *
 * Prefetch the next chunk while writing the current one so ffmpeg stays fed
 * between Range boundaries (big desktop speed win on long HD files).
 */
const CHUNK_SIZE = 8 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 120_000;
/**
 * Range chunks downloaded concurrently ahead of the write cursor. Each chunk is
 * read fully into memory, so these connections really transfer in parallel —
 * a single residential-proxy connection tops out around 1 MB/s. Bounded memory:
 * PARALLEL_CHUNKS × CHUNK_SIZE per track (64 MB).
 */
const PARALLEL_CHUNKS = 8;
const CHUNK_ATTEMPTS = 3;

function isLoopback(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/** ffmpeg always reads through the loopback relay — it handles chunking AND
 *  the extraction proxy (googlevideo URLs are bound to the extracting IP). */
function ffmpegInputUrl(ticketId: string, track: 'video' | 'audio'): string {
  return `http://127.0.0.1:${config.port}/api/stream/${ticketId}/src/${track}`;
}

/** Per-input ffmpeg flags: survive relay hiccups on long transfers. */
function inputArgs(url: string): string[] {
  return [
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '4',
    '-i',
    url,
  ];
}

/** One dispatcher per proxy URL — ProxyAgent holds a reusable connection pool. */
const dispatchers = new Map<string, Dispatcher>();

function dispatcherFor(proxy: string): Dispatcher {
  let d = dispatchers.get(proxy);
  if (!d) {
    const pool = {
      connections: 8,
      pipelining: 1,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    };
    // undici runtime accepts pool options on ProxyAgent; older typings take only the URL.
    d = proxy
      ? (new (ProxyAgent as unknown as new (u: string, opts?: object) => Dispatcher)(proxy, pool))
      : new Agent(pool);
    dispatchers.set(proxy, d);
  }
  return d;
}

function parseTotalSize(contentRange: string | null): number | null {
  const total = contentRange?.split('/')[1];
  const n = Number(total);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pump a web ReadableStream into the response with backpressure. */
async function writeBody(body: ReadableStream<Uint8Array>, res: Response): Promise<void> {
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    if (res.destroyed) {
      await reader.cancel().catch(() => undefined);
      return;
    }
    if (!res.write(value)) {
      await new Promise<void>((resolve) => res.once('drain', resolve));
    }
  }
}

type UpstreamResponse = Awaited<ReturnType<typeof undiciFetch>>;

async function fetchRangeChunk(
  url: string,
  proxy: string,
  offset: number,
  referer?: string,
): Promise<UpstreamResponse> {
  const headers: Record<string, string> = {
    Range: `bytes=${offset}-${offset + CHUNK_SIZE - 1}`,
    'User-Agent': BROWSER_UA,
  };
  if (referer) headers.Referer = referer;

  return undiciFetch(url, {
    dispatcher: dispatcherFor(proxy),
    headers,
    signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS),
  });
}

/**
 * 1-byte Range probe of a CDN URL through the ticket's proxy. Returns the HTTP
 * status (0 on network error) and, when available, the total size.
 */
export async function probeMediaUrl(
  url: string,
  proxy: string,
  referer?: string,
): Promise<{ status: number; total: number | null }> {
  const headers: Record<string, string> = { Range: 'bytes=0-0', 'User-Agent': BROWSER_UA };
  if (referer) headers.Referer = referer;
  try {
    const r = await undiciFetch(url, {
      dispatcher: dispatcherFor(proxy),
      headers,
      signal: AbortSignal.timeout(6_000),
    });
    await r.body?.cancel().catch(() => undefined);
    return { status: r.status, total: parseTotalSize(r.headers.get('content-range')) };
  } catch {
    return { status: 0, total: null };
  }
}

/** Download one Range chunk fully into memory, retrying transient failures. */
async function fetchChunkBuffer(
  url: string,
  proxy: string,
  offset: number,
  referer: string | undefined,
  aborted: () => boolean,
): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CHUNK_ATTEMPTS && !aborted(); attempt++) {
    try {
      const upstream = await fetchRangeChunk(url, proxy, offset, referer);
      if (upstream.status !== 206) {
        await upstream.body?.cancel().catch(() => undefined);
        throw new Error(`upstream chunk failed with HTTP ${upstream.status}`);
      }
      return Buffer.from(await upstream.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < CHUNK_ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('chunk download aborted');
}

async function writeBuffer(res: Response, buf: Buffer): Promise<void> {
  if (res.destroyed) return;
  if (!res.write(buf)) {
    await new Promise<void>((resolve) => {
      const done = () => {
        res.off('drain', done);
        res.off('close', done);
        resolve();
      };
      res.once('drain', done);
      res.once('close', done);
    });
  }
}

/**
 * Range chunks from the CDN. The first chunk streams straight through (fast
 * first byte); the following chunks download PARALLEL_CHUNKS at a time into
 * memory and are written in order.
 */
async function relayChunked(
  url: string,
  proxy: string,
  res: Response,
  aborted: () => boolean,
  referer?: string,
): Promise<void> {
  const first = await fetchRangeChunk(url, proxy, 0, referer);

  if (first.status === 200) {
    // Upstream ignored Range — relay the whole body as-is.
    if (!first.body) throw new Error('empty upstream body');
    if (!res.headersSent) res.status(200);
    await writeBody(first.body, res);
    res.end();
    return;
  }
  if (first.status !== 206 || !first.body) {
    await first.body?.cancel().catch(() => undefined);
    throw new Error(`upstream chunk failed with HTTP ${first.status}`);
  }

  const total = parseTotalSize(first.headers.get('content-range'));
  if (total !== null && !res.headersSent) res.setHeader('Content-Length', total);

  const inflight = new Map<number, Promise<Buffer>>();
  let nextOffset = CHUNK_SIZE;
  const schedule = () => {
    while (total !== null && !aborted() && inflight.size < PARALLEL_CHUNKS && nextOffset < total) {
      const p = fetchChunkBuffer(url, proxy, nextOffset, referer, aborted);
      p.catch(() => undefined); // surfaced when awaited in order
      inflight.set(nextOffset, p);
      nextOffset += CHUNK_SIZE;
    }
  };

  schedule();
  await writeBody(first.body, res);

  for (let offset = CHUNK_SIZE; total !== null && offset < total; offset += CHUNK_SIZE) {
    if (aborted()) return;
    schedule();
    const job = inflight.get(offset);
    if (!job) break;
    const buf = await job;
    inflight.delete(offset);
    schedule();
    await writeBuffer(res, buf);
  }
  res.end();
}

/**
 * GET /api/stream/:ticketId/src/:track — loopback-only CDN relay for ffmpeg.
 * Never exposed to browsers: it serves the raw video-only / audio-only track.
 */
streamRouter.get('/stream/:ticketId/src/:track', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const ticket = getStreamTicket(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Expired.' });

  const url =
    req.params.track === 'audio' ? ticket.selection.audioUrl : ticket.selection.videoUrl;
  if (!url) return res.status(404).json({ error: 'No such track.' });

  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
  });

  res.setHeader('Content-Type', req.params.track === 'audio' ? 'audio/mp4' : 'video/mp4');
  const platform = detectPlatform(ticket.sourceUrl);
  const referer =
    platform?.id === 'instagram'
      ? 'https://www.instagram.com/'
      : platform?.id === 'facebook'
        ? 'https://www.facebook.com/'
        : undefined;
  relayChunked(url, ticket.proxy, res, () => clientGone, referer).catch((err: unknown) => {
    logger.warn('stream relay failed:', (err as Error).message);
    if (!res.headersSent) res.status(502).json({ error: 'Upstream fetch failed.' });
    else res.destroy();
  });
});

/**
 * GET /api/stream/:ticketId
 * GET /api/stream/:ticketId/:fileName  (fileName ignored for lookup; forces .mp4 in URL)
 * Stream-through download: ffmpeg copy-remuxes the CDN stream(s) into a
 * fragmented MP4 piped straight to the browser. Nothing touches disk, the
 * bytes flow exactly once, and the attachment header makes the browser save
 * immediately instead of rendering a black video page.
 */
function contentDispositionAttachment(filename: string): string {
  const safe = (filename.replace(/[^\w.\- ]+/g, '_').trim() || 'video.mp4').slice(0, 120);
  const withExt = /\.mp4$/i.test(safe) ? safe : `${safe}.mp4`;
  const ascii = withExt.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(withExt)}`;
}

function platformReferer(sourceUrl: string): string | undefined {
  const platform = detectPlatform(sourceUrl);
  if (platform?.id === 'instagram') return 'https://www.instagram.com/';
  if (platform?.id === 'facebook') return 'https://www.facebook.com/';
  return undefined;
}

/**
 * Progressive (single-file) downloads: relay CDN bytes with an exact
 * Content-Length — no ffmpeg remux, so browser progress is accurate and speed
 * stays near the CDN Range throughput (much faster than remux).
 */
function handleProgressiveDownload(
  req: Request,
  res: Response,
  ticket: NonNullable<ReturnType<typeof getStreamTicket>>,
): void {
  const { filename } = ticket;
  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
  });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    endTicketTransfer(ticket);
  };

  // Content-Type / Disposition first; relayChunked sets exact Content-Length
  // from the CDN Content-Range so the browser download bar is accurate.
  res.status(200);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const referer = platformReferer(ticket.sourceUrl);
  relayChunked(ticket.selection.videoUrl, ticket.proxy, res, () => clientGone, referer)
    .catch((err: unknown) => {
      logger.warn('progressive stream relay failed:', (err as Error).message);
      if (!res.headersSent) res.status(502).json({ error: 'Could not stream this video. Please try again.' });
      else res.destroy();
    })
    .finally(release);

  req.on('close', () => {
    clientGone = true;
  });

  logger.info(
    `Stream-through progressive relay ${ticket.selection.formatIds} ${ticket.selection.height}p → ${filename}`,
  );
}

function handleStreamDownload(req: Request, res: Response): void {
  const ticket = getStreamTicket(req.params.ticketId);
  if (!ticket) {
    res.status(404).json({ error: 'That download link has expired. Please try again.' });
    return;
  }
  // Slot was reserved when the ticket was created — refuse parallel GETs that
  // used to stack ffmpeg processes and stall every other mobile download.
  if (ticket.transferActive) {
    res.status(409).json({ error: 'That download is already in progress. Please wait, or try again.' });
    return;
  }
  if (!beginTicketTransfer(ticket)) {
    res.status(503).json({ error: 'The server is busy right now. Please try again shortly.' });
    return;
  }

  const { selection, filename, clip } = ticket;
  const hasClip = Boolean(clip && clip.endTime > clip.startTime);

  // Progressive CDN relay (exact Content-Length) — including YouTube when
  // yt-dlp picked a muxed H.264 file. Skipping ffmpeg here is a large desktop
  // speed win; Safari Zero KB came from wrong remux Content-Length, not this path.
  if (selection.kind === 'progressive' && !hasClip && !ticket.enhanceTo) {
    handleProgressiveDownload(req, res, ticket);
    return;
  }

  // Optional clip: input-seek (-ss before -i) + -t duration, still -c copy so
  // the browser download starts immediately (no full-file server job).
  const seekArgs = hasClip ? ['-ss', String(clip!.startTime)] : [];
  const durationArgs = hasClip
    ? ['-t', String(Math.max(0.1, clip!.endTime - clip!.startTime))]
    : [];

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-fflags',
    '+genpts',
    ...seekArgs,
    ...inputArgs(ffmpegInputUrl(ticket.id, 'video')),
  ];
  if (selection.kind === 'merge' && selection.audioUrl) {
    args.push(
      ...seekArgs,
      ...inputArgs(ffmpegInputUrl(ticket.id, 'audio')),
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
    );
  } else {
    args.push('-map', '0');
  }
  // Fragmented MP4: bytes can be sent before the full file exists (a normal
  // moov-at-end MP4 would need a seekable output, i.e. a temp file).
  // Do NOT set Content-Length here — remuxed size ≠ CDN track totals, and a
  // wrong length leaves Safari stuck on "Downloading… Zero KB".
  args.push(
    ...durationArgs,
    ...(ticket.enhanceTo
      ? [
          '-vf',
          `scale=w=if(gt(iw\\,ih)\\,-2\\,${ticket.enhanceTo}):h=if(gt(iw\\,ih)\\,${ticket.enhanceTo}\\,-2):flags=lanczos,unsharp=5:5:0.7:3:3:0.3`,
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-crf',
          '20',
          '-profile:v',
          'high',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'copy',
        ]
      : ['-c', 'copy']),
    '-max_muxing_queue_size',
    '9999',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    'pipe:1',
  );

  const child = spawn(config.ffmpegPath, args, {
    windowsHide: true,
    // Larger stdout buffer so 500MB remuxes don't stall on tiny pipe chunks.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.stdout) {
    child.stdout.setMaxListeners?.(20);
  }

  let stderr = '';
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    endTicketTransfer(ticket);
  };

  // Headers only after the first bytes arrive, so an instant ffmpeg failure
  // (expired/IP-locked URL → 403) becomes a JSON error, not an empty download.
  // Pipe immediately — never delay on size probes (that stalled Safari downloads).
  child.stdout.once('data', (first: Buffer) => {
    if (res.writableEnded || res.destroyed) return;
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
    res.setHeader('Cache-Control', 'no-store');
    // Chrome tries to "Resume" mid-stall when it thinks Range is supported —
    // remux pipes cannot resume, which leaves downloads stuck on Resuming…
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ticket.contentLength != null && ticket.contentLength > 0) {
      // Hint only — clients may track in-app progress. Not Content-Length.
      res.setHeader('X-Expected-Size', String(ticket.contentLength));
    }
    res.write(first);
    child.stdout.pipe(res);
  });

  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  child.on('error', (err) => {
    release();
    logger.error('stream ffmpeg spawn failed:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not start the download. Please try again.' });
    } else {
      res.destroy();
    }
  });

  child.on('close', (code) => {
    release();
    if (code === 0 && res.headersSent) return; // pipe() ends the response
    if (code === 0) {
      // ffmpeg "succeeded" without producing bytes — treat as failure.
      logger.warn(`stream ffmpeg produced no output for ${ticket.sourceUrl.slice(0, 60)}`);
      return void res.status(502).json({ error: 'Could not stream this video. Please try again.' });
    }
    logger.warn(`stream ffmpeg exit ${code}: ${stderr.slice(0, 400)}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Could not stream this video. Please try again.' });
    } else {
      // Abort mid-transfer so the browser reports a failed download instead of
      // silently saving a truncated file.
      res.destroy();
    }
  });

  req.on('close', () => {
    if (child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
    }
  });

  logger.info(
    `Stream-through ${selection.kind} ${selection.formatIds} ${selection.height}p` +
      `${hasClip ? ` clip ${clip!.startTime}-${clip!.endTime}s` : ''} → ${filename}`,
  );
}

/**
 * GET /api/stream/:ticketId/check → { ok, upstreamStatus }
 * One-byte Range probe of the CDN track through the ticket's proxy (no ffmpeg).
 * Desktop hands large files to the browser download manager, which cannot
 * report a 502 back to the page — the client probes here first so a dead
 * stream shows a real error instead of "Your video is saving…".
 * Must be registered before /stream/:ticketId/:fileName.
 */
/** Pull bytes for up to `ms` over `conns` parallel connections; returns MB/s. */
async function measureMbps(
  url: string,
  proxy: string | null,
  conns: number,
  ms: number,
  rangeEach: number,
): Promise<{ mbPerSec: number; status: number }> {
  let bytes = 0;
  let status = 0;
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  await Promise.all(
    Array.from({ length: conns }, async (_, i) => {
      try {
        const r = await undiciFetch(url, {
          ...(proxy !== null ? { dispatcher: dispatcherFor(proxy) } : {}),
          headers: {
            Range: `bytes=${i * rangeEach}-${(i + 1) * rangeEach - 1}`,
            'User-Agent': BROWSER_UA,
          },
          signal: ac.signal,
        });
        status = r.status;
        if (!r.body) return;
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
        }
      } catch {
        /* aborted at the time limit or failed — bytes so far still count */
      }
    }),
  );
  clearTimeout(timer);
  const secs = Math.max(0.001, (Date.now() - started) / 1000);
  return { mbPerSec: Math.round((bytes / 1048576 / secs) * 10) / 10, status };
}

const NEUTRAL_TEST_FILES = [
  'https://proof.ovh.net/files/100Mb.dat',
  'http://speedtest.tele2.net/100MB.zip',
  'https://hil-speed.hetzner.com/100MB.bin',
  'https://ash-speed.hetzner.com/100MB.bin',
];

/**
 * GET /api/stream/:ticketId/speedtest — temporary diagnostic: is the download
 * speed capped by the proxy or by the video CDN? Needs a valid stream ticket.
 */
streamRouter.get('/stream/:ticketId/speedtest', async (req, res) => {
  const ticket = getStreamTicket(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'expired' });
  const video = ticket.selection.videoUrl;
  const M = 1048576;
  const out: Record<string, unknown> = { proxyHost: ticket.proxy ? new URL(ticket.proxy).host : null };
  const ovh = NEUTRAL_TEST_FILES[0];
  out.neutralDirect = await measureMbps(ovh, null, 1, 4000, 90 * M);
  out.neutralViaProxy = await measureMbps(ovh, ticket.proxy, 1, 4000, 90 * M);
  for (const [conns, mb] of [[8, 8], [16, 4], [16, 2], [32, 2], [24, 1], [1, 60]] as const) {
    out[`youtube_${conns}conn_x_${mb}MB`] = await measureMbps(video, ticket.proxy, conns, 7000, mb * M);
  }
  res.json(out);
});

streamRouter.get('/stream/:ticketId/check', async (req, res) => {
  const ticket = getStreamTicket(req.params.ticketId);
  if (!ticket) return res.status(404).json({ ok: false, error: 'That download link has expired. Please try again.' });

  const headers: Record<string, string> = { Range: 'bytes=0-0', 'User-Agent': BROWSER_UA };
  const referer = platformReferer(ticket.sourceUrl);
  if (referer) headers.Referer = referer;
  try {
    const upstream = await undiciFetch(ticket.selection.videoUrl, {
      dispatcher: dispatcherFor(ticket.proxy),
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    await upstream.body?.cancel().catch(() => undefined);
    const ok = upstream.status === 200 || upstream.status === 206;
    // Diagnostics (no secrets): which player client minted the URL and which
    // proxy host relays it.
    const media = new URL(ticket.selection.videoUrl);
    const diag: Record<string, unknown> = {
      client: media.searchParams.get('c'),
      proxyHost: ticket.proxy ? new URL(ticket.proxy).host : null,
    };
    if (!ok) {
      logger.warn(`stream check: upstream HTTP ${upstream.status} (${JSON.stringify(diag)}) for ${ticket.sourceUrl.slice(0, 60)}`);
    }
    return res.status(ok ? 200 : 502).json({ ok, upstreamStatus: upstream.status, ...diag });
  } catch (err) {
    logger.warn('stream check failed:', (err as Error).message);
    return res.status(502).json({ ok: false, upstreamStatus: null });
  }
});

streamRouter.get('/stream/:ticketId', handleStreamDownload);
streamRouter.get('/stream/:ticketId/:fileName', handleStreamDownload);
