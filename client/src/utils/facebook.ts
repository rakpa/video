import type { VideoInfo } from '../types';
import { normalizeUrl } from './platform';

export function extractFacebookVideoId(url: string): string | null {
  try {
    const u = new URL(normalizeUrl(url));
    const v = u.searchParams.get('v');
    if (v) return v;
    const watch = u.pathname.match(/\/videos\/(\d+)/);
    if (watch) return watch[1];
    const reel = u.pathname.match(/\/reel\/(\d+)/);
    if (reel) return reel[1];
  } catch {
    /* invalid */
  }
  return null;
}

/** Instant Facebook card while the API loads thumbnail/metadata. */
export function fetchClientFacebookPreview(url: string): VideoInfo {
  const id = extractFacebookVideoId(url) ?? '';
  return {
    platform: 'facebook',
    id,
    title: 'Facebook video',
    author: 'Facebook',
    durationSeconds: null,
    thumbnail: null,
    formats: [],
  };
}
