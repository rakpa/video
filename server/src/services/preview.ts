import type { PlatformId } from './platform.js';
import type { VideoInfo } from './ytdlp.js';
import { fetchYoutubePreview } from './previewYoutube.js';

export { extractYoutubeId, fetchYoutubePreview } from './previewYoutube.js';

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function metaContent(html: string, prop: string): string | undefined {
  const re1 = new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)`, 'i');
  const re2 = new RegExp(`content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i');
  const raw = html.match(re1)?.[1] ?? html.match(re2)?.[1];
  return raw ? decodeHtml(raw) : undefined;
}

/** Scrape og:title / og:image — fast (~1–3s) when the CDN page is reachable. */
async function scrapeOpenGraph(url: string): Promise<{ title?: string; image?: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
    const image = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
    if (!title && !image) return null;
    return { title, image };
  } catch {
    return null;
  }
}

function extractInstagramShortcode(url: string): string {
  try {
    const m = new URL(url).pathname.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

function cleanInstagramUrl(url: string): string {
  const id = extractInstagramShortcode(url);
  if (!id) return url;
  try {
    const path = new URL(url).pathname;
    if (/\/reel/i.test(path)) return `https://www.instagram.com/reel/${id}/`;
    if (/\/reels/i.test(path)) return `https://www.instagram.com/reels/${id}/`;
    if (/\/tv/i.test(path)) return `https://www.instagram.com/tv/${id}/`;
    return `https://www.instagram.com/p/${id}/`;
  } catch {
    return url;
  }
}

function parseInstagramTitle(raw?: string): { title: string; author: string } {
  if (!raw) return { title: 'Instagram Reel', author: 'Instagram' };
  // "User on Instagram: \"caption...\"" or "Video by user on Instagram"
  const byMatch = raw.match(/^Video by (.+?) on Instagram/i);
  if (byMatch) return { title: raw, author: byMatch[1].trim() };
  const onMatch = raw.match(/^(.+?) on Instagram(?::\s*(.*))?$/i);
  if (onMatch) {
    const author = onMatch[1].trim();
    const caption = onMatch[2]?.replace(/^["']|["']$/g, '').trim();
    return { title: caption || raw, author };
  }
  return { title: raw.replace(/\s*on Instagram.*$/i, '').trim() || 'Instagram Reel', author: 'Instagram' };
}

async function fetchInstagramPreview(url: string): Promise<VideoInfo | null> {
  const clean = cleanInstagramUrl(url.trim());
  const id = extractInstagramShortcode(clean);

  const og = await scrapeOpenGraph(clean);
  if (og?.title || og?.image) {
    const { title, author } = parseInstagramTitle(og.title);
    return {
      id,
      title,
      author,
      durationSeconds: null,
      // OG images are often a low-res still — wait for yt-dlp's frame on /api/info.
      thumbnail: null,
      formats: [],
    };
  }

  return null;
}

async function fetchFacebookPreview(url: string): Promise<VideoInfo | null> {
  const og = await scrapeOpenGraph(url.trim());
  if (og?.title || og?.image) {
    return {
      id: '',
      title: og.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
      author: 'Facebook',
      durationSeconds: null,
      thumbnail: null,
      formats: [],
    };
  }
  return null;
}

export async function fetchPreview(url: string, platform: PlatformId): Promise<VideoInfo | null> {
  if (platform === 'youtube') return fetchYoutubePreview(url);
  if (platform === 'instagram') return fetchInstagramPreview(url);
  if (platform === 'facebook') return fetchFacebookPreview(url);
  return null;
}
