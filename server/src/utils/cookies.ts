import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface CookiesStatus {
  path: string | null;
  exists: boolean;
  lines: number;
  hasYoutube: boolean;
  hasGoogle: boolean;
}

/** Check whether the configured cookies file is present and looks valid. */
export function getCookiesStatus(): CookiesStatus {
  const cookiesPath = config.ytdlpCookies || null;
  if (!cookiesPath) {
    return { path: null, exists: false, lines: 0, hasYoutube: false, hasGoogle: false };
  }

  try {
    const content = fs.readFileSync(cookiesPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length;
    return {
      path: cookiesPath,
      exists: true,
      lines,
      hasYoutube: content.includes('youtube.com'),
      hasGoogle: content.includes('google.com'),
    };
  } catch {
    return { path: cookiesPath, exists: false, lines: 0, hasYoutube: false, hasGoogle: false };
  }
}

/**
 * yt-dlp rewrites the cookies file when it closes (to persist refreshed
 * session tokens). Hosts that mount secrets READ-ONLY (e.g. /etc/secrets)
 * make that write throw `OSError: Read-only file system` and
 * crash yt-dlp on exit — even after extraction succeeded. To avoid this we
 * copy the configured cookies to a writable temp file once and hand yt-dlp
 * that copy instead. The path lives OUTSIDE config.tmpRoot so the temp sweeper
 * never deletes it.
 */
let writableCookiesPath: string | null | undefined;

export function getUsableCookiesPath(): string | null {
  if (writableCookiesPath !== undefined) return writableCookiesPath;

  const src = config.ytdlpCookies;
  if (!src) {
    writableCookiesPath = null;
    return null;
  }
  try {
    const dest = path.join(os.tmpdir(), 'clipvault-cookies.txt');
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o600);
    writableCookiesPath = dest;
    logger.info(`yt-dlp cookies: copied to writable ${dest}`);
  } catch (err) {
    // Fall back to the original path — better degraded auth than no cookies.
    logger.warn(`yt-dlp cookies: could not create writable copy (${(err as Error).message}); using ${src}`);
    writableCookiesPath = src;
  }
  return writableCookiesPath;
}

/** Log cookies status once at startup (no secret values). */
export function logCookiesStatus(): void {
  const status = getCookiesStatus();
  if (!status.path) {
    logger.info('yt-dlp cookies: not configured');
    return;
  }
  if (!status.exists) {
    logger.warn(`yt-dlp cookies: file not found at ${status.path}`);
    return;
  }
  logger.info(
    `yt-dlp cookies: loaded from ${status.path} (${status.lines} lines, google=${status.hasGoogle}, youtube=${status.hasYoutube})`,
  );
  if (!status.hasGoogle || !status.hasYoutube) {
    logger.warn('yt-dlp cookies: file should include both .google.com and .youtube.com entries');
  }
}
