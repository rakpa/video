import { Router } from 'express';
import { request, ProxyAgent, type Dispatcher } from 'undici';
import {
  getDirectStream,
  dropDirectStream,
  beginStream,
  endStream,
} from '../services/directStream.js';
import { logDownload } from '../utils/downloadLogger.js';
import { logger } from '../utils/logger.js';

export const streamRouter = Router();

/** One agent per proxy URL, reused across streams (connection pooling). */
const agents = new Map<string, ProxyAgent>();

function dispatcherFor(proxy: string): Dispatcher | undefined {
  if (!proxy) return undefined;
  let agent = agents.get(proxy);
  if (!agent) {
    agent = new ProxyAgent(proxy);
    agents.set(proxy, agent);
  }
  return agent;
}

/**
 * GET /api/stream/:id
 * Pipes a pre-muxed file straight from the platform's CDN to the browser —
 * the SaveFrom model. Nothing touches disk and no worker slot is held, so this
 * route sustains thousands of concurrent transfers; the pipe goes through the
 * same proxy that extracted the URL because media URLs are IP-locked.
 */
streamRouter.get('/stream/:id', async (req, res) => {
  const entry = getDirectStream(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'That download link has expired. Please try again.' });
  }

  const headers: Record<string, string> = { ...entry.headers };
  delete headers['Accept-Encoding'];
  delete headers['accept-encoding'];
  if (req.headers.range) headers.range = String(req.headers.range);

  let upstream: Awaited<ReturnType<typeof request>>;
  try {
    upstream = await request(entry.mediaUrl, {
      method: 'GET',
      headers,
      dispatcher: dispatcherFor(entry.proxy),
      maxRedirections: 5,
      headersTimeout: 30_000,
      bodyTimeout: 0,
    });
  } catch (err) {
    dropDirectStream(entry.id);
    logger.warn('Direct stream upstream connect failed:', (err as Error).message);
    return res.status(502).json({ error: 'Could not reach the video source. Please try again.' });
  }

  if (upstream.statusCode >= 400) {
    // URL expired or the CDN refused this proxy — retire the entry so the
    // client's retry goes through the normal yt-dlp pipeline instead.
    upstream.body.destroy();
    dropDirectStream(entry.id);
    logger.warn(`Direct stream rejected upstream (${upstream.statusCode}): ${entry.id}`);
    return res.status(502).json({ error: 'The video source refused the request. Please try again.' });
  }

  res.status(upstream.statusCode === 206 ? 206 : 200);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  const contentLength = upstream.headers['content-length'];
  if (contentLength) res.setHeader('Content-Length', String(contentLength));
  const contentRange = upstream.headers['content-range'];
  if (contentRange) res.setHeader('Content-Range', String(contentRange));

  beginStream();
  let settled = false;
  const settle = (completed: boolean) => {
    if (settled) return;
    settled = true;
    endStream();
    // Count each finished full transfer as a download (range requests are
    // resumes/seeks of the same file, not new downloads).
    if (completed && !req.headers.range && entry.platformId) {
      logDownload({
        platform: entry.platformId,
        quality: entry.qualityLabel,
        outputHeight: entry.height,
        requestedHeight: entry.requestedHeight,
        ip: entry.ip,
      });
    }
  };

  upstream.body.on('error', (err: Error) => {
    logger.warn('Direct stream broke mid-transfer:', err.message);
    settle(false);
    if (!res.writableEnded) res.destroy();
  });
  res.on('close', () => {
    if (!res.writableEnded) upstream.body.destroy();
    settle(res.writableEnded);
  });
  upstream.body.pipe(res).on('finish', () => settle(true));
});
