/**
 * Instagram URL helpers — keep info-json cache keys and scrape/oEmbed URLs aligned.
 * Tracking params (?igsh=…) must not create a second yt-dlp -J extraction.
 */

/** Pull shortcode from /reel/, /reels/, /p/, /tv/ paths. */
export function extractInstagramShortcode(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Canonical URL without tracking params — oEmbed/scrape/cache work better with this. */
export function cleanInstagramUrl(url: string): string {
  const trimmed = url.trim();
  const id = extractInstagramShortcode(trimmed);
  if (!id) return trimmed;
  try {
    const path = new URL(trimmed).pathname;
    if (/\/reel/i.test(path)) return `https://www.instagram.com/reel/${id}/`;
    if (/\/reels/i.test(path)) return `https://www.instagram.com/reels/${id}/`;
    if (/\/tv/i.test(path)) return `https://www.instagram.com/tv/${id}/`;
    return `https://www.instagram.com/p/${id}/`;
  } catch {
    return trimmed;
  }
}
