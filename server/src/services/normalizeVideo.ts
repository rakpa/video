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

/** Mobile fast downloads above 1080p are often VP9/HEVC — Photos/gallery need H.264. */
const MOBILE_GALLERY_HEIGHT_THRESHOLD = 1080;

export function needsGalleryNormalizeForJob(
  platformId: string | undefined,
  fast?: boolean,
  requestedHeight?: number,
): boolean {
  if (needsGalleryNormalize(platformId)) return true;
  return Boolean(
    fast && requestedHeight != null && requestedHeight > MOBILE_GALLERY_HEIGHT_THRESHOLD,
  );
}

/** Only one ffmpeg transcode at a time — prevents OOM on 512 MB Render free tier. */
let normalizeChain: Promise<unknown> = Promise.resolve();

function enqueueNormalize<T>(fn: () => Promise<T>): Promise<T> {
  const next = normalizeChain.then(fn, fn);
  normalizeChain = next.catch(() => undefined);
  return next;
}

async function readHeadBytes(filePath: string, max = 512 * 1024): Promise<Buffer> {
  const fh = await fsp.open(filePath, 'r');
  try {
    const stat = await fh.stat();
    const len = Math.min(stat.size, max);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, 0);
    return buf;
  } finally {
    await fh.close();
  }
}

function bytesLookH264(buf: Buffer): boolean {
  const hasAvc = buf.includes(Buffer.from('avc1')) || buf.includes(Buffer.from('avc3'));
  const hasHevc = buf.includes(Buffer.from('hvc1')) || buf.includes(Buffer.from('hev1'));
  return hasAvc && !hasHevc;
}

function hasFaststartMoov(buf: Buffer): boolean {
  const moov = buf.indexOf(Buffer.from('moov'));
  const mdat = buf.indexOf(Buffer.from('mdat'));
  return moov >= 0 && (mdat < 0 || moov < mdat);
}

/** Skip ffmpeg remux when yt-dlp already produced H.264 + faststart MP4. */
export async function canServeDirectToGallery(filePath: string): Promise<boolean> {
  const head = await readHeadBytes(filePath).catch(() => null);
  if (!head || !bytesLookH264(head)) return false;
  return hasFaststartMoov(head);
}

function bytesLookHevc(buf: Buffer): boolean {
  return buf.includes(Buffer.from('hvc1')) || buf.includes(Buffer.from('hev1'));
}

async function probeVideoCodec(filePath: string): Promise<'h264' | 'hevc' | 'other'> {
  const head = await readHeadBytes(filePath).catch(() => null);
  if (head) {
    if (bytesLookH264(head)) return 'h264';
    if (bytesLookHevc(head)) return 'hevc';
  }

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
  } catch {
    /* fall through */
  }
  return 'other';
}

/** Reads the encoded height of the finished MP4 (for quality verification). */
export async function probeVideoHeight(filePath: string): Promise<number | null> {
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
        'stream=height',
        '-of',
        'csv=p=0',
        filePath,
      ],
      { windowsHide: true, timeout: 15_000 },
    );
    const h = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(h) && h > 0 ? h : null;
  } catch {
    return null;
  }
}

/** Confirm the output is H.264 (avc1) — iOS only offers "Save Video" for this codec. */
async function verifyH264Mp4(filePath: string): Promise<boolean> {
  const head = await readHeadBytes(filePath).catch(() => null);
  if (head && bytesLookH264(head)) return true;
  return (await probeVideoCodec(filePath)) === 'h264';
}

async function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  await exec(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], {
    windowsHide: true,
    timeout: timeoutMs,
  });
}

/** Remux H.264 in a new container — near-zero RAM vs full transcode. */
async function remuxForGallery(inputPath: string, jobDir: string, fast = false): Promise<string> {
  await fsp.mkdir(jobDir, { recursive: true });
  try {
    await fsp.access(inputPath);
  } catch {
    throw new Error(`Gallery remux input missing: ${inputPath}`);
  }

  const outputPath = path.join(jobDir, 'gallery-ready.mp4');
  const tempPath = path.join(jobDir, 'gallery-ready.tmp.mp4');
  const strategies: { label: string; args: string[]; faststart: boolean }[] = fast
    ? [
        { label: 'copy all streams', args: ['-i', inputPath, '-c', 'copy'], faststart: true },
        { label: 'copy without faststart', args: ['-i', inputPath, '-c', 'copy'], faststart: false },
      ]
    : [
        { label: 'copy all streams', args: ['-i', inputPath, '-c', 'copy'], faststart: true },
        {
          label: 'copy video + aac audio',
          args: ['-i', inputPath, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ac', '2'],
          faststart: true,
        },
        { label: 'copy without faststart', args: ['-i', inputPath, '-c', 'copy'], faststart: false },
        { label: 'copy video only', args: ['-i', inputPath, '-c:v', 'copy', '-an'], faststart: true },
        {
          label: 'copy with genpts',
          args: ['-fflags', '+genpts', '-i', inputPath, '-c', 'copy'],
          faststart: true,
        },
      ];

  const errors: string[] = [];
  for (const strategy of strategies) {
    await fsp.unlink(tempPath).catch(() => undefined);
    await fsp.unlink(outputPath).catch(() => undefined);
    try {
      logger.info(`Gallery remux (${strategy.label}): ${path.basename(inputPath)}`);
      const tail = strategy.faststart
        ? ['-movflags', '+faststart', '-y', tempPath]
        : ['-y', tempPath];
      await runFfmpeg([...strategy.args, ...tail], 3 * 60_000);
      await fsp.rename(tempPath, outputPath);
      if (!(await verifyH264Mp4(outputPath))) {
        throw new Error('Output is not H.264');
      }
      await fsp.unlink(inputPath).catch(() => undefined);
      return outputPath;
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${strategy.label}: ${msg}`);
      logger.warn(`Gallery remux failed (${strategy.label}):`, msg);
      await fsp.unlink(tempPath).catch(() => undefined);
      await fsp.unlink(outputPath).catch(() => undefined);
    }
  }

  throw new Error(`Gallery remux failed — ${errors.join('; ')}`);
}

interface TranscodeStrategy {
  label: string;
  outputName: string;
  extraArgs: string[];
  timeoutMs: number;
}

export interface GalleryNormalizeOptions {
  /** IG/FB mobile — smallest/fastest transcode tiers. */
  fast?: boolean;
  /** User-selected height (1440/2160) — mobile YouTube VP9/HEVC → H.264 at this cap. */
  targetHeight?: number;
}

/** H.264 transcode args that cap output height (not width) so 2K/4K stay sharp. */
function buildH264HeightScaleArgs(maxHeight: number, crf = 20): string[] {
  const level = maxHeight >= 2160 ? '5.1' : maxHeight >= 1440 ? '4.1' : maxHeight >= 1080 ? '4.0' : '3.1';
  const profile = maxHeight >= 1080 ? 'high' : 'main';
  return [
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    `scale=-2:'min(${maxHeight},ih)':force_original_aspect_ratio=decrease,format=yuv420p,setsar=1`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    String(crf),
    '-profile:v',
    profile,
    '-level',
    level,
    '-pix_fmt',
    'yuv420p',
    '-tag:v',
    'avc1',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
  ];
}

/** High-res mobile gallery prep — try requested height, then 1080p / 720p fallbacks. */
function buildHighResGalleryStrategies(requestedHeight: number): TranscodeStrategy[] {
  const tiers = [requestedHeight, 1080, 720].filter((h, i, arr) => h <= requestedHeight && arr.indexOf(h) === i);
  return tiers.map((h, idx) => ({
    label: `H.264 ${h}p gallery`,
    outputName: idx === 0 ? 'gallery-ready.mp4' : `gallery-ready-${h}.mp4`,
    timeoutMs: h >= 2160 ? 25 * 60_000 : h >= 1440 ? 18 * 60_000 : 12 * 60_000,
    extraArgs: buildH264HeightScaleArgs(h, h >= 1440 ? 20 : 22),
  }));
}

function galleryNormalizeOptions(job: {
  platformId?: string;
  fast?: boolean;
  requestedHeight?: number;
}): GalleryNormalizeOptions {
  if (needsGalleryNormalize(job.platformId)) {
    return { fast: job.fast };
  }
  return { targetHeight: job.requestedHeight };
}

/** Memory-safe ffmpeg flags for Render's 512 MB free tier. */
const FFMPEG_LOW_MEM = ['-threads', '1', '-max_muxing_queue_size', '256'];

const TRANSCODE_STRATEGIES: TranscodeStrategy[] = config.lowMemoryMode
  ? [
      {
        label: 'H.264 360p minimal',
        outputName: 'gallery-ready-tiny.mp4',
        timeoutMs: 12 * 60_000,
        extraArgs: [
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          "scale='min(360,iw)':-2:flags=fast_bilinear,format=yuv420p,setsar=1",
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-tune',
          'fastdecode',
          '-crf',
          '32',
          '-profile:v',
          'baseline',
          '-level',
          '3.0',
          '-pix_fmt',
          'yuv420p',
          '-tag:v',
          'avc1',
          '-x264-params',
          'ref=1:bframes=0:threads=1:weightp=0',
          '-c:a',
          'aac',
          '-b:a',
          '48k',
          '-ar',
          '44100',
          '-ac',
          '1',
        ],
      },
      {
        label: 'H.264 480p ultrafast',
        outputName: 'gallery-ready-lite.mp4',
        timeoutMs: 10 * 60_000,
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
        label: 'H.264 360p video-only',
        outputName: 'gallery-ready-vo.mp4',
        timeoutMs: 8 * 60_000,
        extraArgs: [
          '-map',
          '0:v:0',
          '-an',
          '-vf',
          "scale='min(360,iw)':-2:flags=fast_bilinear,format=yuv420p,setsar=1",
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '32',
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
        timeoutMs: 10 * 60_000,
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
        timeoutMs: 8 * 60_000,
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

async function transcodeForGallery(
  inputPath: string,
  jobDir: string,
  options: GalleryNormalizeOptions = {},
): Promise<string> {
  await fsp.mkdir(jobDir, { recursive: true });
  try {
    await fsp.access(inputPath);
  } catch {
    throw new Error(`Gallery transcode input missing: ${inputPath}`);
  }

  const { fast = false, targetHeight } = options;
  const errors: string[] = [];
  let strategies: TranscodeStrategy[];
  if (targetHeight != null && targetHeight > MOBILE_GALLERY_HEIGHT_THRESHOLD) {
    strategies = buildHighResGalleryStrategies(targetHeight);
  } else if (fast) {
    // IG/FB mobile — smallest/fastest only.
    strategies = TRANSCODE_STRATEGIES.slice(0, 1);
  } else {
    strategies = TRANSCODE_STRATEGIES.filter((s) => !s.outputName.includes('tiny'));
  }

  for (const strategy of strategies) {
    const outputPath = path.join(jobDir, strategy.outputName);
    await fsp.unlink(outputPath).catch(() => undefined);

    try {
      logger.info(`Gallery transcode (${strategy.label}): ${path.basename(inputPath)}`);
      await runFfmpeg(
        [
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
        ],
        strategy.timeoutMs,
      );

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
      for (const other of strategies) {
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
 * Make a video iOS/Android-Photos-compatible (H.264 + faststart MP4).
 * IG/FB use the fast tiny tiers; mobile YouTube 2K/4K keep the requested height.
 */
export function normalizeForGallery(
  inputPath: string,
  jobDir: string,
  options: GalleryNormalizeOptions = {},
): Promise<string> {
  const fast = options.fast ?? false;
  return enqueueNormalize(async () => {
    const codec = await probeVideoCodec(inputPath);
    logger.info(
      `Gallery normalize probe=${codec} file=${path.basename(inputPath)} fast=${fast} target=${options.targetHeight ?? 'n/a'}`,
    );
    if (codec === 'h264') {
      try {
        return await remuxForGallery(inputPath, jobDir, fast);
      } catch (remuxErr) {
        logger.warn('Gallery remux failed, falling back to transcode:', (remuxErr as Error).message);
        return transcodeForGallery(inputPath, jobDir, options);
      }
    }
    return transcodeForGallery(inputPath, jobDir, options);
  });
}

export { galleryNormalizeOptions };

/** Cut a segment from a downloaded MP4 — stream copy preserves original quality. */
export async function trimVideo(
  inputPath: string,
  jobDir: string,
  startSec: number,
  endSec: number,
): Promise<string> {
  const duration = Math.max(0.1, endSec - startSec);
  const outputPath = path.join(jobDir, 'clip.mp4');
  const tempPath = path.join(jobDir, 'clip.tmp.mp4');

  // Stream copy only — no re-encode unless both copy strategies fail (quality preserved).
  const strategies: { label: string; args: string[] }[] = [
    {
      label: 'accurate copy',
      args: [
        '-i',
        inputPath,
        '-ss',
        String(startSec),
        '-to',
        String(endSec),
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
      ],
    },
    {
      label: 'fast copy',
      args: [
        '-ss',
        String(startSec),
        '-i',
        inputPath,
        '-t',
        String(duration),
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
      ],
    },
    {
      label: 're-encode fallback',
      args: [
        '-ss',
        String(startSec),
        '-i',
        inputPath,
        '-t',
        String(duration),
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ],
    },
  ];

  const errors: string[] = [];
  for (const strategy of strategies) {
    await fsp.unlink(tempPath).catch(() => undefined);
    await fsp.unlink(outputPath).catch(() => undefined);
    try {
      logger.info(`Clip trim (${strategy.label}): ${startSec}s–${endSec}s`);
      await runFfmpeg([...strategy.args, '-movflags', '+faststart', '-y', tempPath], 5 * 60_000);
      await fsp.rename(tempPath, outputPath);
      return outputPath;
    } catch (err) {
      errors.push(`${strategy.label}: ${(err as Error).message}`);
    }
  }

  throw new Error(`Could not trim this clip — ${errors.join('; ')}`);
}
