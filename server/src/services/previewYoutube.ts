import type { VideoInfo } from './ytdlp.js';

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/** Pull a YouTube video id from common URL shapes. */
export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
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
 * Near-instant YouTube preview via the public oEmbed endpoint (~200ms).
 * Full format data still comes from yt-dlp on /api/info.
 */
export async function fetchYoutubePreview(url: string): Promise<VideoInfo | null> {
  const id = extractYoutubeId(url);
  if (!id) return null;

  const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
  const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) {
      return {
        id,
        title: 'Untitled video',
        author: 'Unknown',
        durationSeconds: null,
        thumbnail,
        formats: [],
      };
    }

    const data = (await res.json()) as OEmbedResponse;
    return {
      id,
      title: data.title ?? 'Untitled video',
      author: data.author_name ?? 'Unknown',
      durationSeconds: null,
      thumbnail: data.thumbnail_url ?? thumbnail,
      formats: [],
    };
  } catch {
    return {
      id,
      title: 'Untitled video',
      author: 'Unknown',
      durationSeconds: null,
      thumbnail,
      formats: [],
    };
  }
}
