import { Router } from 'express';
import { validateUrl } from '../utils/validate.js';
import { readJsonBody } from '../utils/body.js';
import { getQuality, isCodecMode } from '../services/formats.js';
import { createJob } from '../jobManager.js';
import { YtDlpError, readCachedVideoInfo } from '../services/ytdlp.js';
import { detectPlatform } from '../services/platform.js';
import { maxAllowedHeight, isPro } from '../services/license.js';
import { parseClipRange } from '../utils/clip.js';
import { config } from '../config.js';
import { HIGH_RES_MIN_HEIGHT } from '../utils/downloadLogger.js';
import { getHighResCount, isRedisQuotaEnabled } from '../utils/highResQuota.js';

export const downloadRouter = Router();

/** Best-effort client IP for per-IP download tracking (behind proxies/CDN). */
function clientIpOf(req: import('express').Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    undefined
  );
}

/** The exact message shown when a visitor exhausts their free 2K/4K allowance. */
function highResLimitMessage(): string {
  return 'You have exceeded the free limit of 2K/4K downloads. Please upgrade to the Premium plan for $20 per year to enjoy unlimited 2K/4K downloads.';
}

/**
 * GET /api/download/quota — how many free 2K/4K downloads this IP has left.
 * Pro users always have unlimited access.
 */
downloadRouter.get('/download/quota', async (req, res) => {
  // `store` reveals whether the count is durable (redis) or ephemeral (sqlite,
  // which resets on every free-tier restart). Helps diagnose "limit never hits".
  const store = isRedisQuotaEnabled() ? 'redis' : 'sqlite';
  const ip = clientIpOf(req);
  const pro = isPro((req.query.license as string) ?? null);
  const limit = config.freeHighResLimit;
  if (pro) {
    return res.json({ pro: true, limit, used: 0, remaining: null, unlimited: true, store, ip });
  }
  const used = await getHighResCount(ip);
  const remaining = Math.max(0, limit - used);
  return res.json({ pro: false, limit, used, remaining, unlimited: false, store, ip });
});

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

  const clientIp = clientIpOf(req);

  // High-resolution (2K/4K) gating. Pro/licensed users are entitled outright;
  // everyone else gets a limited number of free 2K/4K downloads per IP, after
  // which high-resolution downloads require Pro.
  const allowedHeight = maxAllowedHeight(license);
  const isHighRes = q.height >= HIGH_RES_MIN_HEIGHT;
  const entitledByLicense = q.height <= allowedHeight;

  if (isHighRes && !entitledByLicense) {
    const used = await getHighResCount(clientIp);
    if (used >= config.freeHighResLimit) {
      return res.status(402).json({
        error: highResLimitMessage(),
        upgrade: true,
        limitReached: true,
        requiredHeight: q.height,
      });
    }
    // Otherwise the visitor still has free 2K/4K downloads remaining — allow it.
  } else if (q.height > allowedHeight) {
    // Non-high-res height above the allowance (shouldn't normally happen).
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
      ip: clientIp,
    });
    return res.status(202).json({ jobId: job.id });
  } catch (err) {
    if (err instanceof YtDlpError) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Could not start the download.' });
  }
});
