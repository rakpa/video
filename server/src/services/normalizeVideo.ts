import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const exec = promisify(execFile);

/** Platforms whose source files are often HEVC/VP9 — Photos on iOS rejects them. */
const GALLERY_NORMALIZE_PLATFORMS = new Set(['instagram', 'facebook']);

export function needsGalleryNormalize(platformId: string | undefined): boolean {
  return platformId != null && GALLERY_NORMALIZE_PLATFORMS.has(platformId);
}

/**
 * Always transcode to H.264 + AAC with faststart.
 * Copy/remux is not enough for Instagram — iOS share sheet shows "Save to Files"
 * instead of "Save Video" unless the MP4 is a Photos-compatible H.264 file.
 *
 * Profile/level: use High profile and let x264 auto-pick the level. Instagram
 * reels are portrait 1080x1920, which EXCEEDS H.264 level 3.1 (max 1280x720) —
 * forcing a too-low level produced a non-conformant stream that iOS refused to
 * import to Photos (only "Save to Files" appeared). High profile + yuv420p is
 * exactly what the iPhone camera records, so Photos always accepts it.
 */
export async function normalizeForGallery(inputPath: string, jobDir: string): Promise<string> {
  const outputPath = path.join(jobDir, 'gallery-ready.mp4');

  const args = [
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-tag:v',
    'avc1',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ];

  logger.info(`Gallery transcode (→ H.264 high, Photos-compatible): ${path.basename(inputPath)}`);

  await exec(config.ffmpegPath, args, { windowsHide: true, timeout: 10 * 60_000 });

  await fsp.unlink(inputPath).catch(() => undefined);
  return outputPath;
}
