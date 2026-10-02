import { Router } from 'express';
import { validateUrl } from '../utils/validate.js';
import { readJsonBody } from '../utils/body.js';
import { getQuality, isCodecMode } from '../services/formats.js';
import { createJob, findCachedJob } from '../jobManager.js';
import { YtDlpError, readCachedVideoInfo } from '../services/ytdlp.js';
import { canDirectPassthrough, resolveDirectDownload } from '../services/directPassthrough.js';
import { canonicalizeMediaUrl, detectPlatform } from '../services/platform.js';
import { maxAllowedHeight, isPro } from '../services/license.js';
import { parseClipRange } from '../utils/clip.js';
import { config } from '../config.js';
import { HIGH_RES_MIN_HEIGHT } from '../utils/downloadLogger.js';
import { getClientIp } from '../utils/clientIp.js';
import { getHighResCount, reserveHighResSlot, quotaStoreKind } from '../utils/highResQuota.js';
import { logDownload } from '../utils/downloadLogger.js';
import { logger } from '../utils/logger.js';

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
 * POST /api/download { url, quality } → { jobId } | { direct, url, filename }
 * Direct passthrough (SaveFrom-style) when eligible; otherwise job + SSE progress.
 */
downloadRouter.post('/download', async (req, res) => {
  const body = readJsonBody(req);
  const { url, quality, mode, license, fast, reuse, galleryPrep, galleryMaxHeight, forceJob } = body;

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

  const trimmedUrl = canonicalizeMediaUrl(String(url ?? ''));
  const platform = detectPlatform(trimmedUrl);
  const cached = readCachedVideoInfo(trimmedUrl);
  const clipResult = parseClipRange(body, cached?.durationSeconds ?? null);
  if (!clipResult.ok) return res.status(400).json({ error: clipResult.error });

  // Default to 'best' when the client omits a codec mode.
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

  // Stream-through: /api/stream remuxes the CDN stream(s) straight into the
  // browser's download at full selected quality (no temp file, no worker slot).
  // YouTube HD and Instagram progressive Reels use this path.
  // forceJob: mobile clients skip passthrough when the remux is too large for
  // phone RAM — the job writes a real file with Content-Length so Safari can
  // show download progress (remux pipes have no length → “Zero KB”).
  // Already cached in R2 (desktop full-video requests): hand back an instant
  // job so the browser downloads from R2 at the user's own connection speed
  // instead of through the proxy-limited stream relay.
  if (!forceJob && Boolean(reuse) && !clipResult.clip && !galleryPrep && !fast) {
    const cachedJob = await findCachedJob(trimmedUrl, q, codecMode, clientIp);
    if (cachedJob) return res.status(202).json({ jobId: cachedJob.id });
  }

  if (
    !forceJob &&
    canDirectPassthrough({
      url: trimmedUrl,
      quality: q,
      galleryPrep: Boolean(galleryPrep),
      clip: clipResult.clip,
    })
  ) {
    try {
      const direct = await resolveDirectDownload(trimmedUrl, q.height, clipResult.clip);
      if (direct) {
        logDownload({
          platform: platform?.id ?? 'youtube',
          quality: q.label,
          outputHeight: direct.height,
          requestedHeight: q.height,
          ip: clientIp,
        });
        // Absolute URL: the frontend lives on a different origin (Vercel) with
        // a catch-all rewrite to index.html — a relative /api/stream path would
        // resolve there and download the SPA shell instead of the video.
        // trust proxy is on, so req.protocol honours X-Forwarded-Proto.
        const apiBase = `${req.protocol}://${req.get('host')}`;
        return res.status(200).json({
          direct: true,
          url: `${apiBase}${direct.url}`,
          filename: direct.filename,
          height: direct.height,
          estimatedBytes: direct.estimatedBytes ?? null,
        });
      }
    } catch (err) {
      logger.warn('Direct passthrough skipped:', (err as Error).message);
    }
  }

  try {
    const job = await createJob(trimmedUrl, q, codecMode, {
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
    logger.error('createJob failed:', err);
    return res.status(500).json({ error: 'Could not start the download.' });
  }
});
