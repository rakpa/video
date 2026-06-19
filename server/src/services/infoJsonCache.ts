import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Caches the raw `yt-dlp -J` dump produced during /api/info so the subsequent
 * download can skip a second (slow) extraction via `--load-info-json`. This is
 * what cuts the ~20s "Download started 0%" wait down to a couple of seconds.
 *
 * The cached media URLs are both time-limited AND locked to the IP that
 * extracted them, so a dump is only reused when it's recent AND the current
 * proxy matches the one used at extraction.
 */
interface Entry {
  path: string;
  createdAt: number;
  proxy: string;
}

const cache = new Map<string, Entry>();
const TTL_MS = 15 * 60 * 1000; // dumps are valid for hours, but stay conservative

function cacheDir(): string {
  return path.join(config.tmpRoot, 'infojson');
}

function fileFor(url: string): string {
  const h = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(cacheDir(), `${h}.json`);
}

/** Persist a raw -J dump for a url, tagged with the proxy that produced it. */
export function saveInfoJson(url: string, rawJson: string, proxy: string): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const p = fileFor(url);
    fs.writeFileSync(p, rawJson);
    cache.set(url, { path: p, createdAt: Date.now(), proxy });
  } catch (err) {
    logger.warn('Could not cache info json:', (err as Error).message);
  }
}

/** Path to a fresh, same-proxy dump for this url, or null to extract normally. */
export function getFreshInfoJson(url: string, proxy: string): string | null {
  const e = cache.get(url);
  if (!e) return null;
  if (e.proxy !== proxy || Date.now() - e.createdAt > TTL_MS) return null;
  if (!fs.existsSync(e.path)) {
    cache.delete(url);
    return null;
  }
  return e.path;
}

/** Drop a cached dump (e.g. after a download fails) so the retry re-extracts. */
export function invalidateInfoJson(url: string): void {
  const e = cache.get(url);
  cache.delete(url);
  if (e) fs.rm(e.path, { force: true }, () => undefined);
}
