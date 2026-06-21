import type { PlatformId } from './platform.js';
import type { VideoInfo } from './ytdlp.js';
import { fetchYoutubePreview } from './previewYoutube.js';

export { extractYoutubeId, fetchYoutubePreview } from './previewYoutube.js';

const OG_CACHE_TTL_MS = 10 * 60 * 1000;
const ogCache = new Map<string, { data: { title?: string; image?: string }; expires: number }>();

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"');
}

function metaContent(html: string, prop: string): string | undefined {
  const re1 = new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)`, 'i');
  const re2 = new RegExp(`content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i');
  const raw = html.match(re1)?.[1] ?? html.match(re2)?.[1];
  return raw ? decodeHtml(raw) : undefined;
}

function extractEmbeddedImage(html: string): string | undefined {
  const patterns = [
    /"display_url":"([^"]+)"/,
    /"thumbnail_src":"([^"]+)"/,
    /"og:image":"([^"]+)"/,
    /"image":"(https:\\\/\\\/[^"]+)"/,
  ];
  for (const re of patterns) {
    const hit = html.match(re)?.[1];
    if (hit) return decodeHtml(hit);
  }
  return undefined;
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Scrape og:title / og:image from one URL (~1–3s when reachable). */
async function scrapeOpenGraphOnce(
  url: string,
  timeoutMs = 5000,
): Promise<{ title?: string; image?: string } | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
    const image =
      metaContent(html, 'og:image') ??
      metaContent(html, 'twitter:image') ??
      extractEmbeddedImage(html);
    if (!title && !image) return null;
    return { title, image };
  } catch {
    return null;
  }
}

/** Race several scrape URLs and return the first hit with an image (or any metadata). */
async function scrapeOpenGraphFast(
  urls: string[],
  cacheKey: string,
): Promise<{ title?: string; image?: string } | null> {
  const cached = ogCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return null;

  const results = await Promise.all(unique.map((u) => scrapeOpenGraphOnce(u)));
  const withImage = results.find((r) => r?.image);
  const hit = withImage ?? results.find(Boolean) ?? null;
  if (hit) ogCache.set(cacheKey, { data: hit, expires: Date.now() + OG_CACHE_TTL_MS });
  return hit;
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

function instagramEmbedUrl(url: string): string {
  const clean = cleanInstagramUrl(url.trim());
  const id = extractInstagramShortcode(clean);
  if (!id) return clean;
  try {
    const path = new URL(clean).pathname;
    if (/\/reel/i.test(path) || /\/reels/i.test(path)) {
      return `https://www.instagram.com/reel/${id}/embed/captioned/`;
    }
    if (/\/tv/i.test(path)) return `https://www.instagram.com/tv/${id}/embed/captioned/`;
    return `https://www.instagram.com/p/${id}/embed/captioned/`;
  } catch {
    return clean;
  }
}

function parseInstagramTitle(raw?: string): { title: string; author: string } {
  if (!raw) return { title: 'Instagram Reel', author: 'Instagram' };
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
  const embed = instagramEmbedUrl(clean);

  const og = await scrapeOpenGraphFast([embed, clean], `ig:${id || clean}`);
  if (og?.title || og?.image) {
    const { title, author } = parseInstagramTitle(og.title);
    return {
      id,
      title,
      author,
      durationSeconds: null,
      thumbnail: og.image ?? null,
      formats: [],
    };
  }

  return null;
}

function facebookScrapeUrls(url: string): string[] {
  const trimmed = url.trim();
  const urls = [trimmed];
  try {
    const mobile = new URL(trimmed);
    mobile.hostname = 'm.facebook.com';
    urls.push(mobile.href);
    urls.push(
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=false`,
    );
  } catch {
    /* keep original */
  }
  return urls;
}

async function fetchFacebookPreview(url: string): Promise<VideoInfo | null> {
  const trimmed = url.trim();
  const og = await scrapeOpenGraphFast(facebookScrapeUrls(trimmed), `fb:${trimmed}`);
  if (og?.title || og?.image) {
    return {
      id: '',
      title: og.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
      author: 'Facebook',
      durationSeconds: null,
      thumbnail: og.image ?? null,
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
