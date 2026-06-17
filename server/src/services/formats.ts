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

export const QUALITIES: Record<QualityId, QualityDef> = {
  '720': {
    id: '720',
    label: '720p',
    tag: 'HD',
    height: 720,
    // Prefer <= target height, but always fall back to "best" so yt-dlp never hard-fails
    // with "Requested format is not available" on unusual videos.
    selector: 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
  },
  '1080': {
    id: '1080',
    label: '1080p',
    tag: 'Full HD',
    height: 1080,
    selector: 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b',
  },
  '1440': {
    id: '1440',
    label: '1440p',
    tag: '2K',
    height: 1440,
    selector: 'bv*[height<=1440]+ba/b[height<=1440]/bv*+ba/b',
  },
  '2160': {
    id: '2160',
    label: '2160p',
    tag: '4K',
    height: 2160,
    selector: 'bv*[height<=2160]+ba/b[height<=2160]/bv*+ba/b',
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
 */
export function buildSelector(quality: QualityDef, mode: CodecMode): string {
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
