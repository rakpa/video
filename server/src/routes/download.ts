import { Router } from 'express';
import { validateUrl } from '../utils/validate.js';
import { getQuality, isCodecMode } from '../services/formats.js';
import { createJob } from '../jobManager.js';
import { YtDlpError } from '../services/ytdlp.js';
import { isPro } from '../services/license.js';
import { config } from '../config.js';

export const downloadRouter = Router();

/**
 * POST /api/download { url, quality } → { jobId }
 * Kicks off the download immediately and returns a job id. The client then
 * subscribes to /api/progress/:jobId and finally GETs /api/file/:jobId.
 */
downloadRouter.post('/download', async (req, res) => {
  const { url, quality, mode, license } = req.body ?? {};

  const v = validateUrl(url);
  if (!v.ok) return res.status(400).json({ error: v.message });

  const q = getQuality(String(quality ?? ''));
  if (!q) return res.status(400).json({ error: 'Please choose a valid quality.' });

  // Gate premium (above free-tier) resolutions behind a valid Pro license.
  if (q.height > config.freeMaxHeight && !isPro(license)) {
    return res.status(402).json({
      error: `${q.label} is a Pro quality. Upgrade to download HD, 2K and 4K.`,
      upgrade: true,
    });
  }

  // Default to 'best' when the client omits a codec mode.
  const codecMode = isCodecMode(mode) ? mode : 'best';

  try {
    const job = await createJob(url.trim(), q, codecMode);
    return res.status(202).json({ jobId: job.id });
  } catch (err) {
    if (err instanceof YtDlpError) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Could not start the download.' });
  }
});
