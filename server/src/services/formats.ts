/**
 * Maps our user-facing quality choices to yt-dlp format selectors.
 *
 * Each selector prefers the best video at-or-below the target height MERGED with
 * the best audio, then falls back to a pre-muxed stream at that height. Output is
 * always remuxed to MP4 with sound by the download service (`--merge-output-format mp4`).
 */
export type QualityId = '720' | '1080' | '1440' | '2160';

export interface QualityDef {
  id: QualityId;
  label: string;
  tag: string; // short badge, e.g. "HD" / "2K" / "4K"
  height: number;
  /** yt-dlp -f selector string. */
  selector: string;
}

/**
 * "Best" selector for a target height that guarantees AAC (m4a) audio so the
 * merged MP4 always plays with sound.
 *
 * YouTube only offers H.264 (avc1) up to 1080p. Preferring avc1 unconditionally
 * would cap 1440p/2160p at 1080p (the avc1 branch matches the 1080p stream), so
 * we only prefer avc1 when it can actually deliver the requested resolution
 * (≤1080). Above that we pick the best video at the true target resolution
 * (VP9/AV1) + AAC audio. Always ends with loose fallbacks so yt-dlp never
 * hard-fails with "Requested format is not available".
 */
function bestSelector(h: number): string {
  const tiers: string[] = [];
  if (h <= 1080) tiers.push(`bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]`);
  tiers.push(`bv*[height<=${h}]+ba[ext=m4a]`);
  tiers.push(`bv*[height<=${h}]+ba`);
  tiers.push(`b[height<=${h}]`);
  tiers.push(`bv*+ba/b`);
  return tiers.join('/');
}

export const QUALITIES: Record<QualityId, QualityDef> = {
  '720': {
    id: '720',
    label: '720p',
    tag: 'HD',
    height: 720,
    // Always pair with AAC (m4a) audio so the MP4 plays with sound everywhere —
    // Opus-in-MP4 (yt-dlp's default "best audio") is silent in most players.
    // Prefer H.264 video for max compatibility, then loosen, never hard-failing.
    selector: bestSelector(720),
  },
  '1080': {
    id: '1080',
    label: '1080p',
    tag: 'Full HD',
    height: 1080,
    selector: bestSelector(1080),
  },
  '1440': {
    id: '1440',
    label: '1440p',
    tag: '2K',
    height: 1440,
    selector: bestSelector(1440),
  },
  '2160': {
    id: '2160',
    label: '2160p',
    tag: '4K',
    height: 2160,
    selector: bestSelector(2160),
  },
};

export function getQuality(id: string): QualityDef | null {
  return (QUALITIES as Record<string, QualityDef>)[id] ?? null;
}

/**
 * Codec preference:
 *  - 'best'       → highest possible resolution (VP9/AV1 allowed) up to 4K.
 *  - 'compatible' → force H.264 video + AAC audio so the MP4 plays in older
 *                   players (QuickTime, legacy WMP). YouTube only offers H.264
 *                   up to 1080p, so this mode is meaningful for 720p/1080p.
 */
export type CodecMode = 'best' | 'compatible';

export function isCodecMode(value: unknown): value is CodecMode {
  return value === 'best' || value === 'compatible';
}

/** The highest resolution that H.264 is reliably available at on these platforms. */
export const COMPATIBLE_MAX_HEIGHT = 1080;

/**
 * Builds the yt-dlp `-f` selector for a quality + codec mode. The download
 * service always remuxes to MP4 (`--merge-output-format mp4`).
 *
 * YouTube uses a fast selector that prefers single-file progressive MP4 when
 * available — avoids a separate audio download + ffmpeg merge (major speed win).
 */
export function buildSelector(
  quality: QualityDef,
  mode: CodecMode,
  platformId?: string,
  options?: { maxHeight?: number },
): string {
  if (platformId === 'youtube' && mode === 'best') {
    return fastYoutubeSelector(quality.height);
  }
  if (platformId === 'instagram' || platformId === 'facebook') {
    return socialGallerySelector(quality, mode, options?.maxHeight);
  }
  if (mode === 'compatible') {
    // Cap at 1080p and strongly prefer avc1 (H.264) + mp4a (AAC), with
    // progressively looser fallbacks so a download still succeeds.
    const h = Math.min(quality.height, COMPATIBLE_MAX_HEIGHT);
    return [
      `bv*[vcodec^=avc1][height<=${h}]+ba[acodec^=mp4a]`,
      `bv*[vcodec^=avc1][height<=${h}]+ba`,
      `b[vcodec^=avc1][height<=${h}]`,
      `b[ext=mp4][height<=${h}]`,
      `b[height<=${h}]`,
      // Last-resort fallback so the job doesn't hard-fail.
      `bv*+ba/b`,
    ].join('/');
  }
  return quality.selector;
}

/**
 * IG/FB: prefer a single progressive H.264 MP4 so gallery prep is a cheap
 * faststart remux — not a RAM-heavy HEVC transcode on Render's 512 MB tier.
 */
function socialGallerySelector(
  quality: QualityDef,
  mode: CodecMode,
  maxHeight = 720,
): string {
  const cap =
    mode === 'compatible'
      ? Math.min(quality.height, maxHeight)
      : Math.min(quality.height, maxHeight, 1080);
  return [
    `b[ext=mp4][vcodec^=avc1][height<=${cap}]`,
    `b[ext=mp4][vcodec*=avc][height<=${cap}]`,
    `b[vcodec^=avc1][height<=${cap}]`,
    `b[ext=mp4][height<=${cap}]`,
    `b[height<=${cap}]`,
    'b',
  ].join('/');
}

/** YouTube: prefer progressive MP4 (one file) → faster start, no merge wait. */
function fastYoutubeSelector(h: number): string {
  const tiers = [
    `b[height<=${h}][ext=mp4]`,
    `b[height<=${h}]`,
  ];
  if (h <= 1080) tiers.push(`bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]`);
  tiers.push(`bv*[height<=${h}]+ba[ext=m4a]`, `bv*[height<=${h}]+ba`, `bv*+ba/b`);
  return tiers.join('/');
}
