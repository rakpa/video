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

interface TranscodeStrategy {
  label: string;
  outputName: string;
  extraArgs: string[];
}

const TRANSCODE_STRATEGIES: TranscodeStrategy[] = [
  {
    label: 'H.264 fast 720p',
    outputName: 'gallery-ready-lite.mp4',
    extraArgs: [
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      "scale='min(720,iw)':-2:force_original_aspect_ratio=decrease,format=yuv420p,setsar=1",
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '26',
      '-profile:v',
      'main',
      '-level',
      '3.1',
      '-pix_fmt',
      'yuv420p',
      '-tag:v',
      'avc1',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-ar',
      '44100',
      '-ac',
      '2',
    ],
  },
  {
    label: 'H.264 video-only',
    outputName: 'gallery-ready-vo.mp4',
    extraArgs: [
      '-map',
      '0:v:0',
      '-an',
      '-vf',
      "scale='min(720,iw)':-2:force_original_aspect_ratio=decrease,format=yuv420p,setsar=1",
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '26',
      '-profile:v',
      'main',
      '-level',
      '3.1',
      '-pix_fmt',
      'yuv420p',
      '-tag:v',
      'avc1',
    ],
  },
  {
    label: 'H.264 + AAC (full res)',
    outputName: 'gallery-ready.mp4',
    extraArgs: [
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p,setsar=1',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
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
    ],
  },
];

/**
 * Transcode Instagram/Facebook HEVC → H.264 so iOS shows "Save Video" in the share sheet.
 * Tries several ffmpeg strategies — IG reels often have odd audio or portrait HEVC.
 */
export async function normalizeForGallery(inputPath: string, jobDir: string): Promise<string> {
  const errors: string[] = [];

  for (const strategy of TRANSCODE_STRATEGIES) {
    const outputPath = path.join(jobDir, strategy.outputName);
    await fsp.unlink(outputPath).catch(() => undefined);

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      ...strategy.extraArgs,
      '-movflags',
      '+faststart',
      '-max_muxing_queue_size',
      '4096',
      '-avoid_negative_ts',
      'make_zero',
      '-y',
      outputPath,
    ];

    try {
      logger.info(`Gallery transcode (${strategy.label}): ${path.basename(inputPath)}`);
      await exec(config.ffmpegPath, args, { windowsHide: true, timeout: 10 * 60_000 });

      if (!(await verifyH264Mp4(outputPath))) {
        throw new Error('Output is not H.264');
      }

      const finalPath = path.join(jobDir, 'gallery-ready.mp4');
      if (outputPath !== finalPath) {
        await fsp.rename(outputPath, finalPath).catch(async () => {
          await fsp.copyFile(outputPath, finalPath);
          await fsp.unlink(outputPath).catch(() => undefined);
        });
      }

      await fsp.unlink(inputPath).catch(() => undefined);
      for (const other of TRANSCODE_STRATEGIES) {
        if (other.outputName !== 'gallery-ready.mp4') {
          await fsp.unlink(path.join(jobDir, other.outputName)).catch(() => undefined);
        }
      }

      return finalPath;
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${strategy.label}: ${msg}`);
      logger.warn(`Gallery transcode failed (${strategy.label}):`, msg);
      await fsp.unlink(outputPath).catch(() => undefined);
    }
  }

  throw new Error(`Gallery transcode failed — ${errors.join('; ')}`);
}
