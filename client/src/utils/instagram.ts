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
 * Fast Instagram preview from the browser (oEmbed when CORS allows).
 * Falls back to a placeholder while the API OG scrape runs.
 */
export async function fetchClientInstagramPreview(url: string): Promise<VideoInfo> {
  const id = extractInstagramShortcode(url) ?? '';
  const clean = cleanInstagramUrl(url);
  const fallback: VideoInfo = {
    platform: 'instagram',
    id,
    title: 'Instagram Reel',
    author: 'Instagram',
    durationSeconds: null,
    thumbnail: null,
    formats: [],
  };

  try {
    const res = await fetch(`https://www.instagram.com/oembed/?url=${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        ...fallback,
        title: data.title ?? fallback.title,
        author: data.author_name ?? fallback.author,
        thumbnail: data.thumbnail_url ?? null,
      };
    }
  } catch {
    /* CORS blocked or timed out — server preview will supply the thumbnail */
  }

  return fallback;
}
