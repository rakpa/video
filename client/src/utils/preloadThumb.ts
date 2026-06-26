import { apiUrl } from '../config/api';
import type { VideoInfo } from '../types';

export interface PreloadedThumb {
  src: string;
  portrait: boolean;
}

export function resolveThumbSrc(info: VideoInfo): string | null {
  if (!info.thumbnail) return null;
  return info.platform === 'youtube'
    ? info.thumbnail
    : apiUrl(`/api/thumb?url=${encodeURIComponent(info.thumbnail)}`);
}

/** Start fetching proxied thumbnail bytes (warms server cache + browser connection). */
export function warmThumbnailFetch(info: VideoInfo): void {
  const src = resolveThumbSrc(info);
  if (!src) return;
  void fetch(src).catch(() => undefined);
}

/** Fetch thumbnail bytes in the background; resolve once the image is decoded. */
export function preloadThumbnail(info: VideoInfo): Promise<PreloadedThumb | null> {
  const src = resolveThumbSrc(info);
  if (!src) return Promise.resolve(null);

  void fetch(src).catch(() => undefined);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ src, portrait: img.naturalHeight > img.naturalWidth });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
