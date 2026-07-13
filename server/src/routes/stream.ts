import { Router, type Response } from 'express';
import { spawn } from 'node:child_process';
import { fetch as undiciFetch, Agent, ProxyAgent, type Dispatcher } from 'undici';
import { config } from '../config.js';
import {
  acquireStreamSlot,
  getStreamTicket,
  releaseStreamSlot,
} from '../services/streamTickets.js';
import { logger } from '../utils/logger.js';

export const streamRouter = Router();

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * googlevideo throttles full-file GETs to roughly playback speed after an
 * initial burst, but serves 10 MB Range chunks at full speed (yt-dlp uses the
 * same trick via http_chunk_size). The loopback relay below fetches upstream
 * in chunks so ffmpeg — which only does single full-file GETs — is never the
 * one talking to the CDN.
 */
const CHUNK_SIZE = 10 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 60_000;

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
    d = proxy ? new ProxyAgent(proxy) : new Agent();
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

/** Sequential 10 MB Range chunks from the CDN piped into `res` at full speed. */
async function relayChunked(
  url: string,
  proxy: string,
  res: Response,
  aborted: () => boolean,
): Promise<void> {
  let offset = 0;
  let total: number | null = null;

  while (!aborted() && (total === null || offset < total)) {
    const upstream = await undiciFetch(url, {
      dispatcher: dispatcherFor(proxy),
      headers: { Range: `bytes=${offset}-${offset + CHUNK_SIZE - 1}`, 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS),
    });

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
    await writeBody(upstream.body, res);
    offset += CHUNK_SIZE;
    if (total === null) break; // unknown size — the first 206 had the whole range
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
  relayChunked(url, ticket.proxy, res, () => clientGone).catch((err: unknown) => {
    logger.warn('stream relay failed:', (err as Error).message);
    if (!res.headersSent) res.status(502).json({ error: 'Upstream fetch failed.' });
    else res.destroy();
  });
});

/**
 * GET /api/stream/:ticketId
 * Stream-through download: ffmpeg copy-remuxes the CDN stream(s) into a
 * fragmented MP4 piped straight to the browser. Nothing touches disk, the
 * bytes flow exactly once, and the attachment header makes the browser save
 * immediately instead of rendering a black video page.
 */
streamRouter.get('/stream/:ticketId', (req, res) => {
  const ticket = getStreamTicket(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'That download link has expired. Please try again.' });
  }
  if (!acquireStreamSlot()) {
    return res.status(503).json({ error: 'The server is busy right now. Please try again shortly.' });
  }

  const { selection, filename } = ticket;

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    ...inputArgs(ffmpegInputUrl(ticket.id, 'video')),
  ];
  if (selection.kind === 'merge' && selection.audioUrl) {
    args.push(...inputArgs(ffmpegInputUrl(ticket.id, 'audio')), '-map', '0:v:0', '-map', '1:a:0');
  } else {
    args.push('-map', '0');
  }
  // Fragmented MP4: bytes can be sent before the full file exists (a normal
  // moov-at-end MP4 would need a seekable output, i.e. a temp file).
  args.push(
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
    releaseStreamSlot();
  };

  // Headers only after the first bytes arrive, so an instant ffmpeg failure
  // (expired/IP-locked URL → 403) becomes a JSON error, not an empty download.
  child.stdout.once('data', (first: Buffer) => {
    if (res.writableEnded || res.destroyed) return;
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
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
    `Stream-through ${selection.kind} ${selection.formatIds} ${selection.height}p → ${filename}`,
  );
});
