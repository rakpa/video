import { Router } from 'express';

export const thumbRouter = Router();

const THUMB_CACHE_TTL_MS = 60 * 60 * 1000;
const thumbCache = new Map<string, { body: Buffer; contentType: string; expires: number }>();

const THUMB_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
};

async function fetchThumbIntoCache(target: URL): Promise<void> {
  const cacheKey = target.href;
  const cached = thumbCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return;

  const upstream = await fetch(target.href, {
    headers: {
      ...THUMB_FETCH_HEADERS,
      Referer: `${target.protocol}//${target.host}/`,
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!upstream.ok || !upstream.body) return;

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  const body = Buffer.from(await upstream.arrayBuffer());
  thumbCache.set(cacheKey, { body, contentType, expires: Date.now() + THUMB_CACHE_TTL_MS });
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
