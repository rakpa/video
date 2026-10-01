import { config, currentProxy, rotateProxy } from '../config.js';
import { getAnyFreshInfoJsonEntry } from './infoJsonCache.js';
import { detectPlatform } from './platform.js';
import type { QualityDef } from './formats.js';
import type { ClipRange } from '../utils/clip.js';
import { ensureInfoJsonCache, pickStreamMergeFormats } from './ytdlp.js';
import {
  createStreamTicket,
  getStreamTicket,
  hasStreamCapacity,
  releaseTicketSlot,
  setStreamTicketContentLength,
} from './streamTickets.js';
import { invalidateInfoJson } from './infoJsonCache.js';
import { probeMediaUrl } from '../routes/stream.js';
import { logger } from '../utils/logger.js';

export interface DirectDownloadResult {
  /** API-relative /api/stream/:ticket URL — the client resolves it against the API host. */
  url: string;
  filename: string;
  height: number;
  formatId: string;
  /** Expected size for browser download progress (Content-Length / client UI). */
  estimatedBytes: number | null;
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
 * YouTube full videos and clips (720p–4K) use this path. Instagram streams
 * progressive Reels (no clip) on desktop AND mobile — we now also support fast
 * merge (DASH) when no single progressive file exists. This makes direct
 * passthrough work for far more Reels instead of falling back to slower job path.
 */
export function canDirectPassthrough(options: PassthroughOptions): boolean {
  if (!config.directPassthrough) return false;

  const platform = detectPlatform(options.url);
  if (platform?.id !== 'youtube' && platform?.id !== 'instagram') return false;
  if (options.galleryPrep && platform.id !== 'instagram') return false;
  // Clips: YouTube only (ffmpeg -ss/-t while remuxing to the browser).
  if (options.clip && platform.id !== 'youtube') return false;
  // Instagram stays ≤1080p. YouTube may stream 2K/4K (VP9/AV1 remux).
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

  // We now allow both progressive and merge for Instagram. Many modern Reels
  // only expose DASH (separate video+audio). Allowing merge here lets them use
  // the fast direct stream path instead of falling back to the slower full job.
  // The remux is still a cheap copy and keeps everything gallery-safe.
  // Instagram Reels are frequently only published at 720p. When the user asked
  // for Full HD, deliver a true 1080p file (Lanczos upscale + light sharpen +
  // high-bitrate H.264) instead of a 720p file under a "1080p" label.
  const enhanceTo =
    platform?.id === 'instagram' && !clip && maxHeight >= 1080 && picked.height >= 480 && picked.height < 1080
      ? 1080
      : null;
  const outHeight = enhanceTo ?? picked.height;
  const filename = safeFilename(
    clip
      ? `VidCliply_${picked.height}p_clip${clipFilenameSuffix(clip)}`
      : `${picked.title}_${outHeight}p`,
  );
  const ticket = createStreamTicket(picked, filename, url.trim(), proxy, clip, enhanceTo);
  if (!ticket) return null;

  logger.info(
    `Direct stream ready: ${picked.formatIds} ${picked.height}p (${picked.kind}` +
      `${clip ? `, clip ${clip.startTime}-${clip.endTime}s` : ''}) for ${url.slice(0, 60)}…`,
  );

  return {
    // Trailing .mp4 so browsers that name files from the URL (not Content-Disposition)
    // still save as video — not a generic/zip download.
    url: `/api/stream/${ticket.id}/${encodeURIComponent(filename)}`,
    filename,
    height: outHeight,
    formatId: picked.formatIds,
    estimatedBytes: ticket.contentLength,
  };
}

/**
 * Resolve a stream-through ticket from warm info-json (no blocking extract).
 * Falls back to a short info-json warm when /api/info has not finished yet.
 * We now cap at 5s max so download "processing" never exceeds user expectation.
 */
export async function resolveDirectDownload(
  url: string,
  maxHeight: number,
  clip: ClipRange | null = null,
): Promise<DirectDownloadResult | null> {
  return resolveDirectDownloadOnce(url, maxHeight, clip);
}

/**
 * Only hand out a stream link the CDN actually accepts. A refused link (403 —
 * IP/proxy mismatch, expired or bot-flagged URL) would otherwise fail in the
 * browser; instead drop the dump and let the caller use the job pipeline,
 * which re-extracts and downloads server-side.
 */
async function verifyDirect(
  result: DirectDownloadResult | null,
  url: string,
): Promise<DirectDownloadResult | null> {
  if (!result) return null;
  const ticketId = result.url.split('/')[3];
  const ticket = getStreamTicket(ticketId);
  if (!ticket) return null;
  const referer = detectPlatform(url)?.id === 'instagram' ? 'https://www.instagram.com/' : undefined;
  const probes = [probeMediaUrl(ticket.selection.videoUrl, ticket.proxy, referer)];
  if (ticket.selection.audioUrl) probes.push(probeMediaUrl(ticket.selection.audioUrl, ticket.proxy, referer));
  const results = await Promise.all(probes);
  const ok = results.every((r) => r.status === 206 || r.status === 200);
  if (ok) {
    // Exact CDN sizes → accurate Content-Length / progress.
    const total = results.reduce((s, r) => s + (r.total ?? 0), 0);
    if (!hasClip(ticket) && !ticket.enhanceTo && total > 0 && results.every((r) => r.total)) {
      setStreamTicketContentLength(ticket.id, total);
      result.estimatedBytes = total;
    }
    return result;
  }
  logger.warn(
    `Direct stream refused by CDN (${results.map((r) => r.status).join('/')}) — falling back to job for ${url.slice(0, 60)}`,
  );
  releaseTicketSlot(ticket);
  invalidateInfoJson(url.trim());
  // A 403 from googlevideo means this exit IP is refused — move the sticky
  // proxy on so the next extraction (and every later user) gets a working IP.
  if (results.some((r) => r.status === 403) && ticket.proxy && ticket.proxy === currentProxy()) {
    const next = rotateProxy();
    logger.info(`Stream proxy refused; rotated to ${next ? new URL(next).host : 'none'}`);
  }
  return null;
}

function hasClip(ticket: { clip: ClipRange | null }): boolean {
  return Boolean(ticket.clip && ticket.clip.endTime > ticket.clip.startTime);
}

async function resolveDirectDownloadOnce(
  url: string,
  maxHeight: number,
  clip: ClipRange | null = null,
): Promise<DirectDownloadResult | null> {
  const trimmed = url.trim();
  const cached = await verifyDirect(resolveFromCache(trimmed, maxHeight, clip), trimmed);
  if (cached) return cached;

  // Cap at 5s so "processing your download" never shows longer than user wants.
  // Most cases now hit cache from preview warm-up. Fallback to job is clean & fast.
  try {
    await Promise.race([
      ensureInfoJsonCache(trimmed),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('passthrough info warm timeout')), 5000),
      ),
    ]);
  } catch (err) {
    logger.warn('Direct stream info warm skipped:', (err as Error).message);
    return null;
  }

  return verifyDirect(resolveFromCache(trimmed, maxHeight, clip), trimmed);
}
