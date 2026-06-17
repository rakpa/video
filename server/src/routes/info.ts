import { Router } from 'express';
import { validateUrl } from '../utils/validate.js';
import { readJsonBody } from '../utils/body.js';
import { fetchInfo, debugProbe, YtDlpError } from '../services/ytdlp.js';
import { detectPlatform } from '../services/platform.js';
import { fetchPreview } from '../services/preview.js';
import { getCachedInfo, setCachedInfo } from '../services/infoCache.js';

export const infoRouter = Router();

/**
 * TEMPORARY DIAGNOSTIC: GET /api/info/debug?url=...&token=clipvault-diag
 * Returns the raw yt-dlp result per client so we can see what the deployed
 * server actually gets. Remove once the YouTube format issue is resolved.
 */
infoRouter.get('/info/debug', async (req, res) => {
  if (req.query.token !== 'clipvault-diag') return res.status(403).json({ error: 'Forbidden.' });
  const url = String(req.query.url ?? '');
  const v = validateUrl(url);
  if (!v.ok) return res.status(400).json({ error: v.message });
  try {
    return res.json({ probes: await debugProbe(url.trim()) });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/info/preview { url } → fast title/thumbnail (YouTube oEmbed). */
infoRouter.post('/info/preview', async (req, res) => {
  const { url } = readJsonBody(req);

  const v = validateUrl(url);
  if (!v.ok) {
    return res.status(400).json({ error: v.message });
  }

  const platform = detectPlatform(url)!;
  try {
    const preview = await fetchPreview(url.trim(), platform.id);
    if (!preview) {
      return res.status(204).end();
    }
    return res.json({ platform: platform.id, ...preview });
  } catch {
    return res.status(204).end();
  }
});

/** POST /api/info { url } → video metadata + quality cards. */
infoRouter.post('/info', async (req, res) => {
  const { url } = readJsonBody(req);

  const v = validateUrl(url);
  if (!v.ok) {
    return res.status(400).json({ error: v.message });
  }

  const trimmed = url.trim();
  const cached = getCachedInfo(trimmed);
  if (cached) {
    const platform = detectPlatform(trimmed)!;
    return res.json({ platform: platform.id, ...cached });
  }

  try {
    const platform = detectPlatform(trimmed)!;
    const info = await fetchInfo(trimmed);
    setCachedInfo(trimmed, info);
    return res.json({ platform: platform.id, ...info });
  } catch (err) {
    if (err instanceof YtDlpError) {
      const status = err.code === 'NO_BINARY' ? 500 : err.code === 'TOO_LONG' ? 413 : 422;
      return res.status(status).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Something went wrong reading that video.' });
  }
});
