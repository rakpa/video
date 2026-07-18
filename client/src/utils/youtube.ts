import type { VideoInfo } from '../types';
import { normalizeUrl } from './platform';
import { fetchYoutubeDurationSeconds } from './youtubeDuration';

/** Pull a YouTube video id from common URL shapes. */
export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(normalizeUrl(url));
    if (u.hostname.replace(/^www\./, '') === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    const v = u.searchParams.get('v');
    if (v) return v;
    const embed = u.pathname.match(/\/embed\/([^/?]+)/);
    if (embed) return embed[1];
    const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
  } catch {
    /* invalid URL */
  }
  return null;
}

/**
 * Instant YouTube preview from the browser (oEmbed + thumbnail fallback).
 * Does not depend on our API, so thumbnails/titles load even when yt-dlp is blocked.
 */
export async function fetchClientYoutubePreview(url: string): Promise<VideoInfo | null> {
  const id = extractYoutubeId(url);
  if (!id) return null;

  const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
  const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        platform: 'youtube',
        id,
        title: data.title ?? 'Untitled video',
        author: data.author_name ?? 'Unknown',
        durationSeconds: null,
        thumbnail: data.thumbnail_url ?? thumbnail,
        formats: [],
      };
    }
  } catch {
    /* oEmbed blocked or timed out — fall back to thumbnail only */
  }

  return {
    platform: 'youtube',
    id,
    title: 'Loading…',
    author: '…',
    durationSeconds: null,
    thumbnail,
    formats: [],
  };
}

/**
 * Fire-and-forget duration for clip "To" / max length. Resolves quickly via
 * YouTube's iframe metadata — far sooner than full /api/info (~4s).
 */
export function warmYoutubeDuration(
  url: string,
  onDuration: (seconds: number) => void,
): void {
  const id = extractYoutubeId(url);
  if (!id) return;
  void fetchYoutubeDurationSeconds(id).then((sec) => {
    if (sec != null && sec > 0) onDuration(sec);
  });
}
