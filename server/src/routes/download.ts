import { Router } from 'express';
import { validateUrl } from '../utils/validate.js';
import { readJsonBody } from '../utils/body.js';
import { getQuality, isCodecMode } from '../services/formats.js';
import { createJob } from '../jobManager.js';
import { YtDlpError, readCachedVideoInfo } from '../services/ytdlp.js';
import { detectPlatform } from '../services/platform.js';
import { maxAllowedHeight } from '../services/license.js';
import { parseClipRange } from '../utils/clip.js';

export const downloadRouter = Router();

/**
 * POST /api/download { url, quality } → { jobId }
 * Kicks off the download immediately and returns a job id. The client then
 * subscribes to /api/progress/:jobId and finally GETs /api/file/:jobId.
 */
downloadRouter.post('/download', async (req, res) => {
  const body = readJsonBody(req);
  const { url, quality, mode, license, fast, reuse } = body;

  const v = validateUrl(url);
  if (!v.ok) return res.status(400).json({ error: v.message });

  const q = getQuality(String(quality ?? ''));
  if (!q) return res.status(400).json({ error: 'Please choose a valid quality.' });

  const allowedHeight = maxAllowedHeight(license);
  if (q.height > allowedHeight) {
    return res.status(402).json({
      error: `${q.label} requires Pro. Upgrade to download 2K or 4K.`,
      upgrade: true,
      requiredHeight: q.height,
    });
  }

  const cached = readCachedVideoInfo(String(url ?? '').trim());
  const clipResult = parseClipRange(body, cached?.durationSeconds ?? null);
  if (!clipResult.ok) return res.status(400).json({ error: clipResult.error });

  // Default to 'best' when the client omits a codec mode.
  const platform = detectPlatform(url.trim());
  const codecMode =
    platform?.id === 'instagram' || platform?.id === 'facebook'
      ? Boolean(fast)
        ? 'compatible'
        : isCodecMode(mode)
          ? mode
          : 'best'
      : isCodecMode(mode)
        ? mode
        : 'best';

  try {
    const job = await createJob(url.trim(), q, codecMode, {
      fast: Boolean(fast),
      reuse: Boolean(reuse),
      clip: clipResult.clip,
    });
    return res.status(202).json({ jobId: job.id });
  } catch (err) {
    if (err instanceof YtDlpError) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Could not start the download.' });
  }
});
