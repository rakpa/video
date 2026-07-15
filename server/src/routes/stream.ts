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
const CHUNK_SIZE = 16 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 90_000;

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

/** Sequential Range chunks from the CDN, with one-chunk prefetch overlap. */
async function relayChunked(
  url: string,
  proxy: string,
  res: Response,
  aborted: () => boolean,
  referer?: string,
): Promise<void> {
  let offset = 0;
  let total: number | null = null;
  let pending: Promise<UpstreamResponse> | null = null;

  const cancelPending = async () => {
    if (!pending) return;
    try {
      const p = await pending;
      await p.body?.cancel().catch(() => undefined);
    } catch {
      /* ignore prefetch errors once aborted */
    }
    pending = null;
  };

  try {
    while (!aborted() && (total === null || offset < total)) {
      const upstream = pending ? await pending : await fetchRangeChunk(url, proxy, offset, referer);
      pending = null;

      if (upstream.status === 200) {
        // Upstream ignored Range — stream the single full response instead.
        if (!upstream.body) throw new Error('empty upstream body');
        if (!res.headersSent) res.status(200);
        await writeBody(upstream.body, res);
        break;
      }
      if (upstream.status !== 206 || !upstream.body) {
        throw new Error(`upstream chunk failed with HTTP ${upstream.status}`);
      }

      if (total === null) {
        total = parseTotalSize(upstream.headers.get('content-range'));
        if (total !== null && !res.headersSent) res.setHeader('Content-Length', total);
      }

      // Prefetch the next Range while writing this one so ffmpeg never waits on
      // a cold TCP/TLS handshake between 16 MB boundaries.
      const nextOffset = offset + CHUNK_SIZE;
      if (total !== null && nextOffset < total && !aborted()) {
        pending = fetchRangeChunk(url, proxy, nextOffset, referer);
      }

      await writeBody(upstream.body, res);
      offset = nextOffset;
      if (total === null) break; // unknown size — the first 206 had the whole range
    }
    res.end();
  } catch (err) {
    await cancelPending();
    throw err;
  } finally {
    if (aborted()) await cancelPending();
  }
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
  if (selection.kind === 'progressive' && !hasClip) {
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
    '-c',
    'copy',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    'pipe:1',
  );

  const child = spawn(config.ffmpegPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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

streamRouter.get('/stream/:ticketId', handleStreamDownload);
streamRouter.get('/stream/:ticketId/:fileName', handleStreamDownload);
