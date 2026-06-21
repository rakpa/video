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

/** Only one ffmpeg transcode at a time — prevents OOM on 512 MB Render free tier. */
let normalizeChain: Promise<unknown> = Promise.resolve();

function enqueueNormalize<T>(fn: () => Promise<T>): Promise<T> {
  const next = normalizeChain.then(fn, fn);
  normalizeChain = next.catch(() => undefined);
  return next;
}

async function probeVideoCodec(filePath: string): Promise<'h264' | 'hevc' | 'other'> {
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
        'stream=codec_name',
        '-of',
        'csv=p=0',
        filePath,
      ],
      { windowsHide: true, timeout: 15_000 },
    );
    const name = stdout.trim().toLowerCase();
    if (name.includes('h264') || name.includes('avc')) return 'h264';
    if (name.includes('hevc') || name.includes('h265')) return 'hevc';
    return 'other';
  } catch {
    try {
      const head = await fsp.readFile(filePath);
      const slice = head.subarray(0, Math.min(head.length, 512 * 1024));
      const hasAvc1 = slice.includes(Buffer.from('avc1'));
      const hasHevc = slice.includes(Buffer.from('hvc1')) || slice.includes(Buffer.from('hev1'));
      if (hasAvc1 && !hasHevc) return 'h264';
      if (hasHevc) return 'hevc';
    } catch {
      /* fall through */
    }
    return 'other';
  }
}

/** Confirm the output is H.264 (avc1) — iOS only offers "Save Video" for this codec. */
async function verifyH264Mp4(filePath: string): Promise<boolean> {
  return (await probeVideoCodec(filePath)) === 'h264';
}

/** Remux H.264 in a new container — near-zero RAM vs full transcode. */
async function remuxForGallery(inputPath: string, jobDir: string): Promise<string> {
  const outputPath = path.join(jobDir, 'gallery-ready.mp4');
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ];
  await exec(config.ffmpegPath, args, { windowsHide: true, timeout: 3 * 60_000 });
  if (!(await verifyH264Mp4(outputPath))) throw new Error('Remux did not produce H.264');
  await fsp.unlink(inputPath).catch(() => undefined);
  return outputPath;
}

interface TranscodeStrategy {
  label: string;
  outputName: string;
  extraArgs: string[];
}

/** Memory-safe ffmpeg flags for Render's 512 MB free tier. */
const FFMPEG_LOW_MEM = ['-threads', '1', '-max_muxing_queue_size', '512'];

const TRANSCODE_STRATEGIES: TranscodeStrategy[] = config.lowMemoryMode
  ? [
      {
        label: 'H.264 480p ultrafast',
        outputName: 'gallery-ready-lite.mp4',
        extraArgs: [
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          "scale='min(480,iw)':-2:force_original_aspect_ratio=decrease,format=yuv420p,setsar=1",
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-tune',
          'fastdecode',
          '-crf',
          '28',
          '-profile:v',
          'baseline',
          '-level',
          '3.0',
          '-pix_fmt',
          'yuv420p',
          '-tag:v',
          'avc1',
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-ar',
          '44100',
          '-ac',
          '2',
        ],
      },
      {
        label: 'H.264 480p video-only',
        outputName: 'gallery-ready-vo.mp4',
        extraArgs: [
          '-map',
          '0:v:0',
          '-an',
          '-vf',
          "scale='min(480,iw)':-2:force_original_aspect_ratio=decrease,format=yuv420p,setsar=1",
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '28',
          '-profile:v',
          'baseline',
          '-level',
          '3.0',
          '-pix_fmt',
          'yuv420p',
          '-tag:v',
          'avc1',
        ],
      },
    ]
  : [
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
    ];

async function transcodeForGallery(inputPath: string, jobDir: string): Promise<string> {
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
      ...FFMPEG_LOW_MEM,
      '-movflags',
      '+faststart',
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

/**
 * Make an Instagram/Facebook video iOS-Photos-compatible. (Only ever called for
 * IG/FB — gated by needsGalleryNormalize.)
 *
 * IG/FB downloads run in `compatible` mode so the video is already H.264, BUT —
 * unlike YouTube — they arrive as a single progressive file that yt-dlp never
 * re-muxes. That keeps Instagram's original container, which commonly stores the
 * `moov` atom at the END of the file. iOS Photos silently REFUSES to import such
 * MP4s via "Save Video" (the prompt appears but nothing is saved). YouTube works
 * because its compatible-mode download merges separate streams, so ffmpeg always
 * rewrites a clean faststart MP4 (moov at the front).
 *
 * So for the common H.264 case we do a stream-COPY remux with `+faststart` — it
 * rewrites the container with moov at the front but re-encodes nothing, so it is
 * near-zero CPU/RAM (safe on Render's 512 MB free tier). Only a genuine
 * HEVC/other codec needs the heavier transcode.
 */
export function normalizeForGallery(inputPath: string, jobDir: string): Promise<string> {
  return enqueueNormalize(async () => {
    const codec = await probeVideoCodec(inputPath);
    if (codec === 'h264') {
      logger.info(`Gallery remux (H.264 + faststart for Photos): ${path.basename(inputPath)}`);
      return remuxForGallery(inputPath, jobDir);
    }
    return transcodeForGallery(inputPath, jobDir);
  });
}
