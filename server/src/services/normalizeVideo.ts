import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const exec = promisify(execFile);

function ffprobePath(): string {
  const ff = config.ffmpegPath;
  if (/[\\/]/.test(ff)) return ff.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
  return 'ffprobe';
}

/** Platforms whose source files are often HEVC/VP9 — Photos on iOS rejects them. */
const GALLERY_NORMALIZE_PLATFORMS = new Set(['instagram', 'facebook']);

export function needsGalleryNormalize(platformId: string | undefined): boolean {
  return platformId != null && GALLERY_NORMALIZE_PLATFORMS.has(platformId);
}

async function probeCodec(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await exec(
      ffprobePath(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', filePath],
      { windowsHide: true, timeout: 30_000 },
    );
    return stdout.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Remux or transcode to H.264 + AAC with faststart so iOS/Android gallery apps
 * index the file after "Save Video" from the mobile share sheet.
 */
export async function normalizeForGallery(inputPath: string, jobDir: string): Promise<string> {
  const outputPath = path.join(jobDir, 'gallery-ready.mp4');
  const codec = await probeCodec(inputPath);
  const isH264 = codec === 'h264' || codec === 'avc1';

  const args = isH264
    ? ['-i', inputPath, '-c', 'copy', '-movflags', '+faststart', '-y', outputPath]
    : [
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-profile:v',
        'main',
        '-level',
        '4.0',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ];

  logger.info(`Gallery normalize (${codec ?? 'unknown'} → ${isH264 ? 'remux' : 'h264'}): ${path.basename(inputPath)}`);

  await exec(config.ffmpegPath, args, { windowsHide: true, timeout: 10 * 60_000 });

  await fsp.unlink(inputPath).catch(() => undefined);
  return outputPath;
}
