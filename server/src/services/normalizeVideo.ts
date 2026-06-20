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

/** Confirm the output is H.264 (avc1) — iOS only offers "Save Video" for this codec. */
async function verifyH264Mp4(filePath: string): Promise<boolean> {
  const ffprobe = config.ffmpegPath.replace(/ffmpeg$/i, 'ffprobe');
  try {
    const { stdout } = await exec(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,codec_tag_string',
        '-of',
        'csv=p=0',
        filePath,
      ],
      { windowsHide: true, timeout: 15_000 },
    );
    const line = stdout.trim().toLowerCase();
    return line.includes('h264') || line.includes('avc1');
  } catch {
    try {
      const head = await fsp.readFile(filePath);
      const slice = head.subarray(0, Math.min(head.length, 512 * 1024));
      const hasAvc1 = slice.includes(Buffer.from('avc1'));
      const hasHevc = slice.includes(Buffer.from('hvc1')) || slice.includes(Buffer.from('hev1'));
      return hasAvc1 && !hasHevc;
    } catch {
      return false;
    }
  }
}

/**
 * Always transcode to H.264 + AAC with faststart.
 * Copy/remux is not enough for Instagram — iOS share sheet shows "Save to Files"
 * instead of "Save Video" unless the MP4 is a Photos-compatible H.264 file.
 *
 * Instagram Reels are portrait 1080×1920 HEVC — level 4.1 + main profile keeps
 * the stream within what iOS Photos accepts (level 3.1 is too low for portrait HD).
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
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p,setsar=1',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-profile:v',
    'main',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-tag:v',
    'avc1',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-max_muxing_queue_size',
    '4096',
    '-avoid_negative_ts',
    'make_zero',
    '-y',
    outputPath,
  ];

  logger.info(`Gallery transcode (→ H.264 main, Photos-compatible): ${path.basename(inputPath)}`);

  await exec(config.ffmpegPath, args, { windowsHide: true, timeout: 10 * 60_000 });

  if (!(await verifyH264Mp4(outputPath))) {
    throw new Error('Gallery transcode did not produce a Photos-compatible H.264 file.');
  }

  await fsp.unlink(inputPath).catch(() => undefined);
  return outputPath;
}
