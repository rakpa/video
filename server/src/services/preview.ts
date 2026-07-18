import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';
import type { PlatformId } from './platform.js';
import type { VideoInfo } from './ytdlp.js';
import { currentProxy } from '../config.js';
import { ensureInfoJsonCache, readCachedVideoInfo, waitForCachedVideoInfo } from './ytdlp.js';
import { fetchYoutubePreview } from './previewYoutube.js';
import { warmThumbCache } from '../routes/thumb.js';
import { cleanInstagramUrl, extractInstagramShortcode } from './instagram.js';
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

/**
 * Instagram serves datacenter IPs a login redirect (no og tags / embed JSON),
 * which pushed every preview onto the slow yt-dlp fallback (~5s to first
 * thumbnail). Scrape through the same proxy yt-dlp extracts with so the fast
 * embed-page scrape actually succeeds. Falls back to plain fetch when no proxy
 * is configured (local dev).
 */
const scrapeDispatchers = new Map<string, Dispatcher>();

function scrapeThroughProxy(
  url: string,
  init: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'follow' | 'error' | 'manual' },
): Promise<Response> {
  const proxy = currentProxy();
  if (!proxy) return fetch(url, init);
  let dispatcher = scrapeDispatchers.get(proxy);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxy);
    scrapeDispatchers.set(proxy, dispatcher);
  }
  return undiciFetch(url, { ...init, dispatcher }) as unknown as Promise<Response>;
}

/** Race scrapes — resolve as soon as any URL returns an image (or best metadata when all finish). */
async function raceForMetadata(
  tasks: Array<
    () => Promise<{ title?: string; image?: string; author?: string; durationSeconds?: number | null } | null>
  >,
): Promise<{ title?: string; image?: string; author?: string; durationSeconds?: number | null } | null> {
  if (!tasks.length) return null;

  return new Promise((resolve) => {
    let pending = tasks.length;
    let fallback: {
      title?: string;
      image?: string;
      author?: string;
      durationSeconds?: number | null;
    } | null = null;
    let done = false;

    const merge = (r: {
      title?: string;
      image?: string;
      author?: string;
      durationSeconds?: number | null;
    }) => {
      fallback = {
        title: r.title ?? fallback?.title,
        image: r.image ?? fallback?.image,
        author: r.author ?? fallback?.author,
        durationSeconds: r.durationSeconds ?? fallback?.durationSeconds,
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

function parseOgDurationSeconds(html: string): number | null {
  const raw =
    metaContent(html, 'og:video:duration') ??
    metaContent(html, 'video:duration') ??
    metaContent(html, 'og:duration');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Scrape og:title / og:image — stop reading HTML once an image tag is found. */
async function scrapeOpenGraphOnce(
  url: string,
  timeoutMs = 5000,
  viaProxy = false,
): Promise<{ title?: string; image?: string; durationSeconds?: number | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await (viaProxy ? scrapeThroughProxy : fetch)(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 160_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      const title = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
      const image =
        metaContent(html, 'og:image') ??
        metaContent(html, 'twitter:image') ??
        extractEmbeddedImage(html);
      if (image) {
        controller.abort();
        return { title, image, durationSeconds: parseOgDurationSeconds(html) };
      }
    }

    const title = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
    const image =
      metaContent(html, 'og:image') ??
      metaContent(html, 'twitter:image') ??
      extractEmbeddedImage(html);
    if (!title && !image) return null;
    return { title, image, durationSeconds: parseOgDurationSeconds(html) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInstagramOembed(
  clean: string,
): Promise<{ title?: string; image?: string; author?: string } | null> {
  try {
    const res = await scrapeThroughProxy(
      `https://www.instagram.com/oembed/?url=${encodeURIComponent(clean)}`,
      {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(2500),
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
  const byMatch = raw.match(/^Video by (.+?) on Instagram(?::\s*(.*))?$/i);
  if (byMatch) {
    const author = byMatch[1].trim();
    const caption = byMatch[2]?.replace(/^["']|["']$/g, '').trim();
    return { title: caption || `Reel by ${author}`, author };
  }
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

function buildInstagramPreview(
  id: string,
  og: { title?: string; image?: string; author?: string; durationSeconds?: number | null },
  durationSeconds: number | null = null,
): VideoInfo {
  const parsed = parseInstagramTitle(og.title);
  return {
    id,
    title: parsed.title,
    author: og.author ?? parsed.author,
    durationSeconds: durationSeconds ?? og.durationSeconds ?? null,
    thumbnail: og.image ?? null,
    sourceMaxHeight: null,
    formats: [],
  };
}

/** Resolve as soon as any task returns a preview with a thumbnail. */
async function raceSocialPreview(
  tasks: Array<() => Promise<VideoInfo | null>>,
): Promise<VideoInfo | null> {
  if (!tasks.length) return null;

  return new Promise((resolve) => {
    let pending = tasks.length;
    let fallback: VideoInfo | null = null;
    let done = false;

    for (const task of tasks) {
      void task().then((result) => {
        if (done) return;
        if (result?.thumbnail) {
          done = true;
          resolve(result);
          return;
        }
        pending--;
        if (result && !fallback) fallback = result;
        if (pending === 0) {
          done = true;
          resolve(fallback);
        }
      });
    }
  });
}

async function fetchFacebookOembed(
  url: string,
): Promise<{ title?: string; image?: string; author?: string } | null> {
  try {
    const res = await fetch(
      `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(url)}`,
      {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(3500),
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
  const id = extractInstagramShortcode(clean) ?? '';
  const embed = instagramEmbedUrl(clean);
  const cacheKey = `ig:${id || clean}`;

  const cached = ogCache.get(cacheKey);
  if (cached && cached.expires > Date.now() && cached.data.image) {
    // Fire-and-forget warm — don't delay the preview JSON; client's /api/thumb
    // shares the same in-flight CDN fetch.
    notePreviewImage(cached.data.image);
    return buildInstagramPreview(id, cached.data);
  }

  const warm = readCachedVideoInfo(clean);
  if (warm?.thumbnail) {
    notePreviewImage(warm.thumbnail);
    return {
      id: warm.id || id,
      title: warm.title,
      author: warm.author,
      durationSeconds: warm.durationSeconds,
      thumbnail: warm.thumbnail,
      sourceMaxHeight: null,
      formats: [],
    };
  }

  void ensureInfoJsonCache(clean).catch(() => undefined);

  const hit = await raceSocialPreview([
    // oEmbed is usually fastest (~300–800 ms) — try it first on its own.
    async () => {
      const og = await fetchInstagramOembed(clean);
      if (!og?.image) return null;
      notePreviewImage(og.image);
      ogCache.set(cacheKey, { data: og, expires: Date.now() + OG_CACHE_TTL_MS });
      return buildInstagramPreview(id, og);
    },
    async () => {
      // Generous budgets: these race against the 12s yt-dlp fallback below, so a
      // longer timeout never delays the preview — it only lets a slightly slow
      // proxied scrape win (~1–2s) instead of aborting into the ~5s yt-dlp wait.
      const og = await raceForMetadata([
        () => scrapeOpenGraphOnce(embed, 4000, true),
        () => scrapeOpenGraphOnce(clean, 4500, true),
      ]);
      if (!og?.title && !og?.image) return null;
      notePreviewImage(og.image);
      if (og.image) ogCache.set(cacheKey, { data: og, expires: Date.now() + OG_CACHE_TTL_MS });
      return buildInstagramPreview(id, og);
    },
    async () => {
      const info = await waitForCachedVideoInfo(clean, 12000);
      if (!info?.thumbnail) return null;
      notePreviewImage(info.thumbnail);
      return {
        id: info.id || id,
        title: info.title,
        author: info.author,
        durationSeconds: info.durationSeconds,
        thumbnail: info.thumbnail,
        sourceMaxHeight: null,
        formats: [],
      };
    },
  ]);

  return hit;
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
  if (cached && cached.expires > Date.now() && cached.data.image) {
    notePreviewImage(cached.data.image);
    return {
      id: '',
      title: cached.data.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
      author: 'Facebook',
      durationSeconds: null,
      thumbnail: cached.data.image ?? null,
      sourceMaxHeight: null,
    formats: [],
    };
  }

  const warm = readCachedVideoInfo(trimmed);
  if (warm?.thumbnail) {
    notePreviewImage(warm.thumbnail);
    return {
      id: warm.id,
      title: warm.title,
      author: warm.author,
      durationSeconds: warm.durationSeconds,
      thumbnail: warm.thumbnail,
      sourceMaxHeight: null,
    formats: [],
    };
  }

  void ensureInfoJsonCache(trimmed).catch(() => undefined);
  const scrapeUrls = facebookScrapeUrls(trimmed);

  const hit = await raceSocialPreview([
    async () => {
      const og = await fetchFacebookOembed(trimmed);
      if (!og?.image && !og?.title) return null;
      notePreviewImage(og.image);
      ogCache.set(cacheKey, { data: og, expires: Date.now() + OG_CACHE_TTL_MS });
      return {
        id: '',
        title: og.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
        author: og.author || 'Facebook',
        durationSeconds: null,
        thumbnail: og.image ?? null,
        sourceMaxHeight: null,
        formats: [],
      };
    },
    async () => {
      const og = await raceForMetadata(
        scrapeUrls.map((u, i) => () => scrapeOpenGraphOnce(u, i === 0 ? 1200 : 2200)),
      );
      if (!og?.title && !og?.image) return null;
      notePreviewImage(og.image);
      ogCache.set(cacheKey, { data: og, expires: Date.now() + OG_CACHE_TTL_MS });
      return {
        id: '',
        title: og.title?.replace(/\s*\|\s*Facebook.*$/i, '').trim() || 'Facebook video',
        author: og.author || 'Facebook',
        durationSeconds: null,
        thumbnail: og.image ?? null,
        sourceMaxHeight: null,
        formats: [],
      };
    },
    async () => {
      const info = await waitForCachedVideoInfo(trimmed, 12000);
      if (!info?.thumbnail) return null;
      notePreviewImage(info.thumbnail);
      return {
        id: info.id,
        title: info.title,
        author: info.author,
        durationSeconds: info.durationSeconds,
        thumbnail: info.thumbnail,
        sourceMaxHeight: null,
        formats: [],
      };
    },
  ]);

  return hit;
}

export async function fetchPreview(url: string, platform: PlatformId): Promise<VideoInfo | null> {
  if (platform === 'youtube') return fetchYoutubePreview(url);
  if (platform === 'instagram') return fetchInstagramPreview(url);
  if (platform === 'facebook') return fetchFacebookPreview(url);
  return null;
}
