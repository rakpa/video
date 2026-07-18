import { Router } from 'express';
import { proxyFetch } from '../utils/proxyFetch.js';

export const thumbRouter = Router();

const THUMB_CACHE_TTL_MS = 60 * 60 * 1000;
const thumbCache = new Map<string, { body: Buffer; contentType: string; expires: number }>();
const thumbInflight = new Map<string, Promise<void>>();

const THUMB_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
};

function needsProxyForThumbHost(host: string): boolean {
  return (
    /(?:^|\.)cdninstagram\.com$/i.test(host) ||
    /(?:^|\.)fbcdn\.net$/i.test(host) ||
    /(?:^|\.)instagram\.com$/i.test(host) ||
    /(?:^|\.)facebook\.com$/i.test(host)
  );
}

async function fetchThumbIntoCache(target: URL): Promise<void> {
  const cacheKey = target.href;
  const cached = thumbCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return;

  let inflight = thumbInflight.get(cacheKey);
  if (!inflight) {
    inflight = (async () => {
      // IG/FB CDNs often throttle or challenge datacenter IPs — use the same
      // residential proxy as yt-dlp so the first paint isn't a multi-second miss.
      const viaProxy = needsProxyForThumbHost(target.hostname);
      const upstream = await proxyFetch(target.href, {
        headers: {
          ...THUMB_FETCH_HEADERS,
          Referer: `${target.protocol}//${target.host}/`,
        },
        timeoutMs: 5000,
        viaProxy,
      });
      if (!upstream.ok || !upstream.body) return;

      const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
      const body = Buffer.from(await upstream.arrayBuffer());
      thumbCache.set(cacheKey, { body, contentType, expires: Date.now() + THUMB_CACHE_TTL_MS });
    })().finally(() => {
      thumbInflight.delete(cacheKey);
    });
    thumbInflight.set(cacheKey, inflight);
  }
  await inflight;
}

/** Pre-fetch a CDN thumbnail so the first browser request is instant. */
export function warmThumbCache(rawUrl: string): void {
  try {
    const target = new URL(rawUrl);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return;
    void fetchThumbIntoCache(target).catch(() => undefined);
  } catch {
    /* invalid url */
  }
}

/**
 * Wait briefly for the thumb bytes so the client's first /api/thumb hit is a
 * cache hit (saves ~0.5–2s of Instagram CDN round-trip on paint).
 */
export async function warmThumbCacheReady(rawUrl: string, maxWaitMs = 700): Promise<void> {
  try {
    const target = new URL(rawUrl);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return;
    await Promise.race([
      fetchThumbIntoCache(target),
      new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
    ]);
  } catch {
    /* invalid url / fetch failed — preview still returns the CDN url */
  }
}

/**
 * GET /api/thumb?url=...
 * Proxies a remote thumbnail through our server so hotlink/CORS-protected CDNs
 * (Instagram's scontent.cdninstagram.com, Facebook's fbcdn.net) still render in
 * the browser — a direct <img src> to those hosts is blocked, so the preview
 * shows nothing. We add a Referer/UA the CDNs expect and stream the bytes back.
 */
thumbRouter.get('/thumb', async (req, res) => {
  const raw = String(req.query.url ?? '');
  let target: URL;
  try {
    target = new URL(raw);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('bad protocol');
  } catch {
    return res.status(400).json({ error: 'Invalid thumbnail url.' });
  }

  const cacheKey = target.href;
  const cached = thumbCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(cached.body);
  }

  try {
    await fetchThumbIntoCache(target);
    const warmed = thumbCache.get(cacheKey);
    if (!warmed) return res.status(502).json({ error: 'Could not load thumbnail.' });

    const { body, contentType } = warmed;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(body);
  } catch {
    res.status(502).json({ error: 'Could not load thumbnail.' });
  }
});
