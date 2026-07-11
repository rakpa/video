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
import { getClientIp } from '../utils/clientIp.js';
import { getHighResCount, reserveHighResSlot, quotaStoreKind } from '../utils/highResQuota.js';
import { findDirectStream } from '../services/directStream.js';

export const downloadRouter = Router();

/** The exact message shown when a visitor exhausts their free 2K/4K allowance. */
function highResLimitMessage(): string {
  return 'You have exceeded the free limit of 2K/4K downloads. Please upgrade to the Premium plan for $20 per year to enjoy unlimited 2K/4K downloads. You can still download 720p and 1080p HD for free — switch to a lower quality to continue.';
}

/**
 * GET /api/download/quota — how many free 2K/4K downloads this IP has left.
 * Pro users always have unlimited access.
 */
downloadRouter.get('/download/quota', async (req, res) => {
  // `store` reveals whether the count is durable (redis/upstash) or ephemeral
  // (sqlite, which resets on every free-tier restart). Diagnoses "limit never hits".
  const store = quotaStoreKind();
  const ip = getClientIp(req);
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
  const { url, quality, mode, license, fast, reuse, galleryPrep, galleryMaxHeight } = body;

  const v = validateUrl(url);
  if (!v.ok) return res.status(400).json({ error: v.message });

  const q = getQuality(String(quality ?? ''));
  if (!q) return res.status(400).json({ error: 'Please choose a valid quality.' });

  const clientIp = getClientIp(req);

  // High-resolution (2K/4K) gating. Pro/licensed users are entitled outright;
  // everyone else gets a limited number of free 2K/4K downloads per IP (any URL).
  const allowedHeight = maxAllowedHeight(license);
  const isHighRes = q.height >= HIGH_RES_MIN_HEIGHT;
  const entitledByLicense = q.height <= allowedHeight;

  if (isHighRes && !entitledByLicense) {
    const slot = await reserveHighResSlot(clientIp, config.freeHighResLimit);
    if (!slot.allowed) {
      return res.status(402).json({
        error: highResLimitMessage(),
        upgrade: true,
        limitReached: true,
        requiredHeight: q.height,
      });
    }
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

  // Fast path: pre-muxed MP4 piped straight from the platform CDN (no yt-dlp
  // download, no worker slot). Only taken when it matches the quality the merge
  // pipeline would deliver; clips and mobile gallery prep always need the full
  // pipeline. On any stream failure the client retries into `createJob` below.
  if (!clipResult.clip && !galleryPrep) {
    const direct = findDirectStream(url.trim(), q, codecMode, { ip: clientIp });
    if (direct) {
      return res.status(200).json({
        direct: true,
        streamUrl: `/api/stream/${direct.id}`,
        filename: direct.filename,
        height: direct.height,
      });
    }
  }

  try {
    const job = await createJob(url.trim(), q, codecMode, {
      fast: Boolean(fast),
      reuse: Boolean(reuse),
      clip: clipResult.clip,
      ip: clientIp,
      galleryPrep: Boolean(galleryPrep),
      galleryMaxHeight:
        typeof galleryMaxHeight === 'number' && galleryMaxHeight > 0 ? galleryMaxHeight : undefined,
    });
    return res.status(202).json({ jobId: job.id });
  } catch (err) {
    // Do NOT roll back the reserved slot — the visitor attempted a 2K/4K download.
    // Rolling back on transient errors ("server busy") meant the count never
    // reached 5 and users had to click multiple times before a job started.
    if (err instanceof YtDlpError) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Could not start the download.' });
  }
});
