import type { PlatformId } from './platform.js';
import type { VideoInfo } from './ytdlp.js';
import { ensureInfoJsonCache } from './ytdlp.js';
import { fetchYoutubePreview } from './previewYoutube.js';
import { warmThumbCache } from '../routes/thumb.js';
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

/** Race scrapes — resolve as soon as any URL returns an image (or best metadata when all finish). */
async function raceForMetadata(
  tasks: Array<() => Promise<{ title?: string; image?: string; author?: string } | null>>,
): Promise<{ title?: string; image?: string; author?: string } | null> {
  if (!tasks.length) return null;

  return new Promise((resolve) => {
    let pending = tasks.length;
    let fallback: { title?: string; image?: string; author?: string } | null = null;
    let done = false;

    const merge = (r: { title?: string; image?: string; author?: string }) => {
      fallback = {
        title: r.title ?? fallback?.title,
        image: r.image ?? fallback?.image,
        author: r.author ?? fallback?.author,
      };
    };

    for (const task of tasks) {
      void task().then((r) => {
        if (done) return;
        pending--;
        if (r?.image) {
          done = true;
          resolve(r);
          return;
        }
        if (r) merge(r);
        if (pending === 0) {
          done = true;
          resolve(fallback);
        }
      });
    }
  });
}

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

async function fetchInstagramOembed(
  clean: string,
): Promise<{ title?: string; image?: string; author?: string } | null> {
  try {
    const res = await fetch(`https://www.instagram.com/oembed/?url=${encodeURIComponent(clean)}`, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!data.thumbnail_url && !data.title) return null;
    return {
      title: data.title,
      image: data.thumbnail_url,
      author: data.author_name,
    };
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

function notePreviewImage(image?: string): void {
  if (image) warmThumbCache(image);
}

async function fetchFacebookOembed(
  url: string,
): Promise<{ title?: string; image?: string; author?: string } | null> {
  try {
    const res = await fetch(
      `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(url)}`,
      {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!data.thumbnail_url && !data.title) return null;
    return {
      title: data.title,
      image: data.thumbnail_url,
      author: data.author_name,
    };
  } catch {
    return null;
  }
}

async function fetchInstagramPreview(url: string): Promise<VideoInfo | null> {
  const clean = cleanInstagramUrl(url.trim());
  const id = extractInstagramShortcode(clean);
  const embed = instagramEmbedUrl(clean);

  void ensureInfoJsonCache(clean).catch(() => undefined);

  const og = await raceForMetadata([
    () => fetchInstagramOembed(clean),
    () => scrapeOpenGraphOnce(embed, 2000),
    () => scrapeOpenGraphOnce(clean, 3500),
  ]);
  if (og?.title || og?.image) {
    notePreviewImage(og.image);
    const { title, author } = og.author
      ? { title: og.title ?? 'Instagram Reel', author: og.author }
      : parseInstagramTitle(og.title);
    if (og.image) {
      ogCache.set(`ig:${id || clean}`, { data: og, expires: Date.now() + OG_CACHE_TTL_MS });
    }
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
    const parsed = new URL(trimmed);
    const mobile = new URL(trimmed);
    mobile.hostname = 'm.facebook.com';
    urls.push(mobile.href);
    urls.push(
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=false`,
    );
    if (parsed.hostname === 'fb.watch') {
      urls.push(`https://www.facebook.com/watch/?v=${parsed.pathname.replace(/^\//, '')}`);
    }
  } catch {
    /* keep original */
  }
  return urls;
}

async function fetchFacebookPreview(url: string): Promise<VideoInfo | null> {
  const trimmed = url.trim();
  const cacheKey = `fb:${trimmed}`;
  const cached = ogCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    notePreviewImage(cached.data.image);
    return {
      id: '',
      title: cached.data.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
      author: 'Facebook',
      durationSeconds: null,
      thumbnail: cached.data.image ?? null,
      formats: [],
    };
  }

  void ensureInfoJsonCache(trimmed).catch(() => undefined);
  const scrapeUrls = facebookScrapeUrls(trimmed);
  const og = await raceForMetadata([
    () => fetchFacebookOembed(trimmed),
    ...scrapeUrls.map((u, i) => () => scrapeOpenGraphOnce(u, i === 0 ? 2000 : 3000)),
  ]);
  if (og?.title || og?.image) {
    notePreviewImage(og.image);
    ogCache.set(`fb:${trimmed}`, { data: og, expires: Date.now() + OG_CACHE_TTL_MS });
    return {
      id: '',
      title: og.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
      author: og.author || 'Facebook',
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
