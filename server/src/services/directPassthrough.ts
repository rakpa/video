import { config, currentProxy } from '../config.js';
import { getAnyFreshInfoJsonEntry } from './infoJsonCache.js';
import { detectPlatform } from './platform.js';
import type { QualityDef } from './formats.js';
import type { ClipRange } from '../utils/clip.js';
import { ensureInfoJsonCache, pickStreamMergeFormats } from './ytdlp.js';
import { createStreamTicket, hasStreamCapacity } from './streamTickets.js';
import { logger } from '../utils/logger.js';

export interface DirectDownloadResult {
  /** API-relative /api/stream/:ticket URL — the client resolves it against the API host. */
  url: string;
  filename: string;
  height: number;
  formatId: string;
}

export interface PassthroughOptions {
  url: string;
  quality: QualityDef;
  galleryPrep?: boolean;
  clip?: ClipRange | null;
}

/**
 * True when the download can be streamed straight through /api/stream: ffmpeg
 * copy-remuxes the CDN video+audio into the response, so the browser download
 * starts immediately at full quality with no server-side temp file.
 *
 * YouTube full videos and clips (720p–4K) use this path. Instagram desktop can
 * stream progressive Reels (no clip) when galleryPrep is off.
 */
export function canDirectPassthrough(options: PassthroughOptions): boolean {
  if (!config.directPassthrough) return false;

  const platform = detectPlatform(options.url);
  if (platform?.id !== 'youtube' && platform?.id !== 'instagram') return false;
  if (options.galleryPrep) return false;
  // Clips: YouTube only (ffmpeg -ss/-t while remuxing to the browser).
  if (options.clip && platform.id !== 'youtube') return false;
  // Instagram stays ≤1080p progressive. YouTube may stream 2K/4K (VP9/AV1 remux).
  if (platform.id === 'instagram' && options.quality.height > 1080) return false;
  // Saturated stream slots → let the request queue through the job pipeline.
  if (!hasStreamCapacity()) return false;
  return true;
}

function safeFilename(base: string): string {
  return `${base.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video'}.mp4`;
}

function clipFilenameSuffix(clip: ClipRange | null | undefined): string {
  if (!clip) return '';
  const s = Math.floor(clip.startTime);
  const e = Math.floor(clip.endTime);
  return `_${s}s-${e}s`;
}

function resolveFromCache(
  url: string,
  maxHeight: number,
  clip: ClipRange | null = null,
): DirectDownloadResult | null {
  const entry = getAnyFreshInfoJsonEntry(url.trim());
  if (!entry) return null;

  // googlevideo URLs are locked to the IP that extracted them, so the stream
  // relay must fetch through the same proxy. Instagram CDN URLs are usually
  // not IP-locked the same way — prefer any fresh dump. A disk-restored entry
  // loses its proxy tag: with a rotating pool we can't know which IP owns the
  // YouTube URLs, so fall back to the job pipeline rather than risk a mid-download 403.
  let proxy = entry.proxy;
  const platform = detectPlatform(url);
  if (!proxy && config.proxies.length > 0) {
    if (platform?.id !== 'instagram' && config.proxies.length > 1) return null;
    proxy = currentProxy() ?? '';
  }

  const picked = pickStreamMergeFormats(entry.path, maxHeight);
  if (!picked) return null;

  // Instagram Reels are progressive H.264 MP4s — refuse merge tickets (rare for IG)
  // if somehow only separate tracks exist without a progressive candidate that
  // pickStreamMergeFormats preferred. Progressive is required for reliable CDN relay.
  if (platform?.id === 'instagram' && picked.kind !== 'progressive') return null;

  const filename = safeFilename(
    clip
      ? `VidCliply_${picked.height}p_clip${clipFilenameSuffix(clip)}`
      : `${picked.title}_${picked.height}p`,
  );
  const ticket = createStreamTicket(picked, filename, url.trim(), proxy, clip);

  logger.info(
    `Direct stream ready: ${picked.formatIds} ${picked.height}p (${picked.kind}` +
      `${clip ? `, clip ${clip.startTime}-${clip.endTime}s` : ''}) for ${url.slice(0, 60)}…`,
  );

  return {
    // Trailing .mp4 so browsers that name files from the URL (not Content-Disposition)
    // still save as video — not a generic/zip download.
    url: `/api/stream/${ticket.id}/${encodeURIComponent(filename)}`,
    filename,
    height: picked.height,
    formatId: picked.formatIds,
  };
}

/**
 * Resolve a stream-through ticket from warm info-json (no blocking extract).
 * Falls back to a short info-json warm when /api/info has not finished yet.
 */
export async function resolveDirectDownload(
  url: string,
  maxHeight: number,
  clip: ClipRange | null = null,
): Promise<DirectDownloadResult | null> {
  const trimmed = url.trim();
  const cached = resolveFromCache(trimmed, maxHeight, clip);
  if (cached) return cached;

  // Keep the warm short so the browser download can start within ~5s of the
  // user clicking Download. After paste, /api/info usually has already warmed
  // the cache — this path is only for the rare cold miss.
  try {
    await Promise.race([
      ensureInfoJsonCache(trimmed),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('passthrough info warm timeout')), 4_500),
      ),
    ]);
  } catch (err) {
    logger.warn('Direct stream info warm skipped:', (err as Error).message);
    return null;
  }

  return resolveFromCache(trimmed, maxHeight, clip);
}
