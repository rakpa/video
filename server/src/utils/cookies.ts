import fs from 'node:fs';
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
