import type { AvailableFormat } from '../types';

const QUALITY_TIERS = [720, 1080, 1440, 2160] as const;

/**
 * Whether a quality tier can be satisfied from the source. yt-dlp picks the best
 * stream at-or-below the requested height, so e.g. an 804p source can still fill
 * a 1080p request. Each tier only needs the previous tier's minimum height.
 */
export function isQualityAvailable(sourceMaxHeight: number, qualityHeight: number): boolean {
  if (sourceMaxHeight === 0) return true;
  const idx = QUALITY_TIERS.indexOf(qualityHeight as (typeof QUALITY_TIERS)[number]);
  if (idx < 0) return sourceMaxHeight >= qualityHeight;
  // A tier is real only when the source is taller than the tier below it —
  // otherwise a 1080p source was offered as "2K" and delivered 1080p.
  if (idx === 0) return sourceMaxHeight >= 1;
  // 1080p stays available for 720p sources: Instagram/Facebook reels are
  // published at 720p and the server delivers a true 1080p (upscaled) file.
  if (qualityHeight === 1080) return sourceMaxHeight >= 720;
  return sourceMaxHeight > QUALITY_TIERS[idx - 1];
}

/** Highest meaningful quality label for UI ("Source video is up to Xp"). */
export function displaySourceMaxHeight(sourceMaxHeight: number): number {
  let display = sourceMaxHeight;
  for (const q of QUALITY_TIERS) {
    if (isQualityAvailable(sourceMaxHeight, q)) display = Math.max(display, q);
  }
  return display;
}

/** Recompute availability from raw source max (matches server + fixes stale API responses). */
export function resolveFormatAvailability(
  formats: AvailableFormat[],
  sourceMaxHeight?: number | null,
): AvailableFormat[] {
  return formats.map((f) => ({
    ...f,
    available:
      typeof sourceMaxHeight === 'number' && sourceMaxHeight > 0
        ? isQualityAvailable(sourceMaxHeight, f.height)
        : f.available,
  }));
}
