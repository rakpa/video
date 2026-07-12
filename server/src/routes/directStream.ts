import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { logger } from '../utils/logger.js';

export const directRouter = Router();

interface DirectStreamEntry {
  cdnUrl: string;
  filename: string;
  expiresAt: number;
}

const tokens = new Map<string, DirectStreamEntry>();
const TOKEN_TTL_MS = 10 * 60_000;

function isAllowedCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith('.googlevideo.com') ||
      host === 'googlevideo.com' ||
      host.endsWith('.youtube.com')
    );
  } catch {
    return false;
  }
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt <= now) tokens.delete(token);
  }
}

/**
 * POST /api/direct/link { url, filename } → { token }
 * Mobile browsers ignore cross-origin download=; same-origin stream fixes that.
 */
directRouter.post('/direct/link', (req, res) => {
  const { url, filename } = req.body as { url?: string; filename?: string };
  if (!url || typeof url !== 'string' || !isAllowedCdnUrl(url)) {
    return res.status(400).json({ error: 'Invalid direct URL.' });
  }

  purgeExpired();
  const token = randomBytes(16).toString('hex');
  const safeName =
    (typeof filename === 'string' ? filename : 'video.mp4')
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 120) || 'video.mp4';

  tokens.set(token, { cdnUrl: url, filename: safeName, expiresAt: Date.now() + TOKEN_TTL_MS });
  return res.json({ token });
});

/**
 * GET /api/direct/:token — stream attachment from CDN (no full file stored on disk).
 */
directRouter.get('/direct/:token', async (req, res) => {
  purgeExpired();
  const entry = tokens.get(req.params.token);
  if (!entry || entry.expiresAt <= Date.now()) {
    return res.status(404).json({ error: 'That download link has expired.' });
  }

  try {
    const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers.Range = String(req.headers.range);

    const upstream = await fetch(entry.cdnUrl, { headers, redirect: 'follow' });
    if (!upstream.ok) {
      logger.warn(`Direct proxy upstream ${upstream.status} for token ${req.params.token.slice(0, 8)}`);
      return res.status(502).json({ error: 'Could not fetch the video from the source.' });
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    if (!upstream.body) {
      return res.status(502).json({ error: 'Empty upstream response.' });
    }

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    };
    pump().catch((err) => {
      logger.warn('Direct proxy stream error:', (err as Error).message);
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
  } catch (err) {
    logger.warn('Direct proxy failed:', (err as Error).message);
    return res.status(502).json({ error: 'Could not stream the video.' });
  }
});
