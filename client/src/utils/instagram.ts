import type { VideoInfo } from '../types';
import { normalizeUrl } from './platform';

/** Pull shortcode from /reel/, /reels/, /p/, /tv/ paths. */
export function extractInstagramShortcode(url: string): string | null {
  try {
    const path = new URL(normalizeUrl(url)).pathname;
    const m = path.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Canonical URL without tracking params — oEmbed/scrape work better with this. */
export function cleanInstagramUrl(url: string): string {
  const id = extractInstagramShortcode(url);
  if (!id) return normalizeUrl(url);
  try {
    const path = new URL(normalizeUrl(url)).pathname;
    if (/\/reel/i.test(path)) return `https://www.instagram.com/reel/${id}/`;
    if (/\/reels/i.test(path)) return `https://www.instagram.com/reels/${id}/`;
    if (/\/tv/i.test(path)) return `https://www.instagram.com/tv/${id}/`;
    return `https://www.instagram.com/p/${id}/`;
  } catch {
    return normalizeUrl(url);
  }
}

/**
 * Instant Instagram card (no network) — avoids the skeleton screen while the
 * API fetches thumbnail/title. YouTube has oEmbed; IG needs this placeholder.
 */
export function fetchClientInstagramPreview(url: string): VideoInfo {
  const id = extractInstagramShortcode(url) ?? '';
  return {
    platform: 'instagram',
    id,
    title: 'Instagram Reel',
    author: 'Instagram',
    durationSeconds: null,
    thumbnail: null,
    formats: [],
  };
}
