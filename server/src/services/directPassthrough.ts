import { config } from '../config.js';
import { getAnyFreshInfoJson } from './infoJsonCache.js';
import { detectPlatform } from './platform.js';
import type { QualityDef } from './formats.js';
import type { ClipRange } from '../utils/clip.js';
import { ensureInfoJsonCache, pickProgressiveDirectUrl } from './ytdlp.js';
import { logger } from '../utils/logger.js';

export interface DirectDownloadResult {
  url: string;
  filename: string;
  height: number;
  formatId: string;
}

export interface PassthroughOptions {
  url: string;
  quality: QualityDef;
  clip?: ClipRange | null;
}

/** True when the browser can pull the file straight from the source CDN (SaveFrom-style). */
export function canDirectPassthrough(options: PassthroughOptions): boolean {
  if (!config.directPassthrough) return false;

  const platform = detectPlatform(options.url);
  if (platform?.id !== 'youtube') return false;
  if (options.clip) return false;
  // Only free-tier HD — 2K/4K need server merge/transcode.
  if (options.quality.height > 1080) return false;
  // YouTube progressive files are capped around 360p on most videos. Our UI offers
  // 720p/1080p — those require DASH merge on the server for real HD quality.
  if (options.quality.height >= 720) return false;
  return true;
}

function safeFilename(title: string): string {
  return `${title.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video'}.mp4`;
}

/**
 * Direct CDN only when the progressive file matches what the user asked for.
 * YouTube 1080p is usually DASH-only; substituting 360p progressive is misleading.
 */
export function meetsDirectQualityFloor(pickedHeight: number, requestedHeight: number): boolean {
  if (pickedHeight <= 0 || requestedHeight <= 0) return false;
  return pickedHeight >= requestedHeight;
}

function resolveFromCache(url: string, maxHeight: number): DirectDownloadResult | null {
  const infoPath = getAnyFreshInfoJson(url.trim());
  if (!infoPath) return null;

  const picked = pickProgressiveDirectUrl(infoPath, maxHeight);
  if (!picked) return null;

  if (!meetsDirectQualityFloor(picked.height, maxHeight)) {
    logger.info(
      `Direct passthrough skipped: ${picked.height}p below ${Math.max(360, Math.round(maxHeight * 0.85))}p floor for ${maxHeight}p request`,
    );
    return null;
  }

  logger.info(
    `Direct passthrough: ${picked.formatId} ${picked.height}p for ${url.slice(0, 60)}…`,
  );

  return {
    url: picked.url,
    filename: safeFilename(picked.title),
    height: picked.height,
    formatId: picked.formatId,
  };
}

/**
 * Resolve a direct googlevideo.com URL from warm info-json (no blocking extract).
 * Falls back to a short info-json warm when /api/info has not finished yet.
 */
export async function resolveDirectDownload(
  url: string,
  maxHeight: number,
): Promise<DirectDownloadResult | null> {
  const trimmed = url.trim();
  const cached = resolveFromCache(trimmed, maxHeight);
  if (cached) return cached;

  try {
    await Promise.race([
      ensureInfoJsonCache(trimmed),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('passthrough info warm timeout')), 22_000),
      ),
    ]);
  } catch (err) {
    logger.warn('Direct passthrough info warm skipped:', (err as Error).message);
    return null;
  }

  return resolveFromCache(trimmed, maxHeight);
}
