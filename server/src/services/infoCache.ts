import type { VideoInfo } from './ytdlp.js';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: VideoInfo; expires: number }>();

export function getCachedInfo(url: string): VideoInfo | null {
  const hit = cache.get(url.trim());
  if (!hit || hit.expires <= Date.now()) return null;
  return hit.data;
}

export function setCachedInfo(url: string, data: VideoInfo): void {
  cache.set(url.trim(), { data, expires: Date.now() + TTL_MS });
}
