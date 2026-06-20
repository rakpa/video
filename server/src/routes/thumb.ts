import { Router } from 'express';

export const thumbRouter = Router();

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

  try {
    const upstream = await fetch(target.href, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: `${target.protocol}//${target.host}/`,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'Could not load thumbnail.' });

    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ error: 'Could not load thumbnail.' });
  }
});
