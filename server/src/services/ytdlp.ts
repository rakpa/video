import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { QUALITIES, buildSelector, type CodecMode, type QualityDef, type QualityId } from './formats.js';
import { detectPlatform } from './platform.js';
import { logger } from '../utils/logger.js';

/** Shape of the metadata we return to the client. */
export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  durationSeconds: number | null;
  thumbnail: string | null;
  /** Available qualities for this specific video, with size estimates. */
  formats: AvailableFormat[];
}

export interface AvailableFormat {
  id: QualityId;
  label: string;
  tag: string;
  height: number;
  /** Estimated bytes (best-effort from yt-dlp metadata), or null if unknown. */
  estimatedBytes: number | null;
  /** False when the source has no stream at/under this height. */
  available: boolean;
  /** True when this resolution requires a Pro subscription (above free tier). */
  premium: boolean;
}

/** Raw (subset of) yt-dlp -J output we care about. */
interface RawDump {
  id: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url: string; preference?: number; width?: number }[];
  formats?: RawFormat[];
}

interface RawFormat {
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number; // total bitrate kbps
}

class YtDlpError extends Error {
  constructor(message: string, public readonly code: 'UNAVAILABLE' | 'TOO_LONG' | 'NO_BINARY' | 'FAILED') {
    super(message);
  }
}
export { YtDlpError };

/** yt-dlp flags tuned for faster metadata extraction (info-only, no download). */
const INFO_ARGS = [
  '-J',
  '--no-warnings',
  '--no-playlist',
  '--no-check-formats',
] as const;

/** Player clients to try on cloud hosts when YouTube blocks the default client. */
const YOUTUBE_PLAYER_CLIENTS = ['web_safari', 'tv_embedded', 'mweb', 'android', 'default'] as const;

/**
 * Args shared by every yt-dlp invocation (info + download) to survive YouTube's
 * bot-detection on cloud/datacenter IPs: a configurable player client and, when
 * provided, an authenticated cookies file. The `youtube:` namespace makes the
 * extractor-arg a no-op for other platforms (Facebook/Instagram).
 */
function youtubeHardeningArgs(playerClient = config.youtubePlayerClient): string[] {
  const args = ['--extractor-args', `youtube:player_client=${playerClient}`];
  if (config.ytdlpCookies) args.push('--cookies', config.ytdlpCookies);
  return args;
}

function ytDlpFailureMessage(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes("sign in to confirm you're not a bot") || s.includes('not a bot') || s.includes('bot detected')) {
    return 'YouTube blocked automated access from this server. Add a cookies.txt on Render (secret file) and set YTDLP_COOKIES, then redeploy.';
  }
  if (s.includes('requested format is not available')) {
    return 'This video does not provide the requested quality/codec combination. Try a lower quality or switch to “Most compatible”.';
  }
  return 'Could not read that video. It may be private, removed, or region-locked.';
}

function downloadFailureMessage(stderr: string): string {
  // Reuse the info-path heuristics first.
  const msg = ytDlpFailureMessage(stderr);
  if (msg !== 'Could not read that video. It may be private, removed, or region-locked.') return msg;

  const s = stderr.toLowerCase();
  if (s.includes('requested format is not available')) {
    return 'Requested format is not available for this video. Try 720p or “Most compatible”.';
  }
  if (s.includes('http error 429') || s.includes('too many requests')) {
    return 'YouTube rate-limited this server (429). Wait a bit and try again.';
  }
  return 'The download failed. The video may be protected or unavailable.';
}

/** Run yt-dlp and collect stdout. Rejects with a typed error on failure. */
function runJson(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp binary not found. Is it installed and on PATH?', 'NO_BINARY'));
      } else {
        reject(new YtDlpError(err.message, 'FAILED'));
      }
    });

    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      logger.warn('yt-dlp info failed:', stderr.slice(0, 500));
      reject(new YtDlpError(ytDlpFailureMessage(stderr), 'UNAVAILABLE'));
    });
  });
}

/** Picks the best thumbnail URL from the dump. */
function pickThumbnail(raw: RawDump): string | null {
  if (raw.thumbnail) return raw.thumbnail;
  if (raw.thumbnails?.length) {
    const sorted = [...raw.thumbnails].sort(
      (a, b) => (b.preference ?? b.width ?? 0) - (a.preference ?? a.width ?? 0),
    );
    return sorted[0]?.url ?? null;
  }
  return null;
}

/**
 * Estimate the merged file size for a target height by taking the largest
 * known progressive/video filesize at-or-below that height and adding a rough
 * audio allowance derived from duration.
 */
function estimateSize(raw: RawDump, height: number, durationSeconds: number | null): number | null {
  const candidates = (raw.formats ?? []).filter(
    (f) => (f.height ?? 0) > 0 && (f.height ?? 0) <= height && f.vcodec !== 'none',
  );
  if (candidates.length === 0) return null;

  const best = candidates.reduce((acc, f) => {
    const size = f.filesize ?? f.filesize_approx ?? (f.tbr && durationSeconds ? (f.tbr * 1000 * durationSeconds) / 8 : 0);
    return size > acc ? size : acc;
  }, 0);

  if (best <= 0) return null;
  // Add ~128kbps audio if the best candidate was video-only.
  const audioBytes = durationSeconds ? (128_000 * durationSeconds) / 8 : 0;
  return Math.round(best + audioBytes);
}

function parseInfoDump(stdout: string): VideoInfo {
  let raw: RawDump;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new YtDlpError('Unexpected response while reading the video.', 'FAILED');
  }

  const duration = typeof raw.duration === 'number' ? raw.duration : null;
  if (duration && duration > config.maxDurationSeconds) {
    throw new YtDlpError(
      `That video is longer than the ${Math.round(config.maxDurationSeconds / 60)}-minute limit.`,
      'TOO_LONG',
    );
  }

  const maxHeight = Math.max(0, ...(raw.formats ?? []).map((f) => f.height ?? 0));

  const formats: AvailableFormat[] = (Object.values(QUALITIES) as QualityDef[]).map((q) => ({
    id: q.id,
    label: q.label,
    tag: q.tag,
    height: q.height,
    estimatedBytes: estimateSize(raw, q.height, duration),
    available: maxHeight === 0 ? true : maxHeight >= Math.min(q.height, 360),
    premium: q.height > config.freeMaxHeight,
  }));

  return {
    id: raw.id,
    title: raw.title ?? 'Untitled video',
    author: raw.uploader ?? raw.channel ?? 'Unknown',
    durationSeconds: duration,
    thumbnail: pickThumbnail(raw),
    formats,
  };
}

/** Fetches metadata + computes the four quality cards for a URL. */
export async function fetchInfo(url: string): Promise<VideoInfo> {
  const platform = detectPlatform(url);
  const isYoutube = platform?.id === 'youtube';
  const clients = isYoutube
    ? config.ytdlpCookies
      ? [config.youtubePlayerClient]
      : [...YOUTUBE_PLAYER_CLIENTS]
    : [config.youtubePlayerClient];

  let lastError: YtDlpError | undefined;
  for (const client of clients) {
    try {
      const stdout = await runJson([...INFO_ARGS, ...youtubeHardeningArgs(client), url]);
      return parseInfoDump(stdout);
    } catch (err) {
      if (err instanceof YtDlpError) lastError = err;
      else throw err;
    }
  }

  throw lastError ?? new YtDlpError('Could not read that video.', 'UNAVAILABLE');
}

export interface DownloadHandle {
  /** Absolute path to the finished MP4 once the promise resolves. */
  outputDir: string;
  /** Cancels the underlying process. */
  cancel: () => void;
  /** Resolves with the produced file path; rejects on error. */
  done: Promise<string>;
}

export interface ProgressUpdate {
  /** Smooth, monotonic 0..100 across all streams + merge. */
  percent: number;
  speed: string | null; // e.g. "2.41MiB/s"
  eta: string | null; // e.g. "00:12"
  stage: 'downloading' | 'merging' | 'done';
  /** 1-based index of the stream currently downloading (video=1, audio=2…). */
  streamIndex: number;
  /** Total streams to download (1 = progressive, 2 = video+audio). */
  streamTotal: number;
}

/** `[download]  23.4% of ~12.34MiB at  2.41MiB/s ETA 00:07` */
const PROGRESS_RE = /\[download\]\s+(\d+(?:\.\d+)?)%(?:\s+of\s+\S+)?(?:\s+at\s+(\S+))?(?:\s+ETA\s+(\S+))?/;
/** `[info] …: Downloading 1 format(s): 398+258` → "398+258" tells us the stream count. */
const FORMAT_RE = /Downloading\s+\d+\s+format\(s\):\s+(\S+)/;
const DEST_RE = /\[download\]\s+Destination:/;
const MERGE_RE = /\[Merger\]|Merging formats/;

/** Fraction of the bar reserved for downloading (the rest is merge/finish). */
const DOWNLOAD_BUDGET = 92;

/** Finds the produced media file in a job directory (largest non-fragment file). */
function findOutputFile(dir: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const media = entries
    .filter((f) => /\.(mp4|mkv|webm|m4a|mov)$/i.test(f))
    // Prefer the merged output over leftover per-stream fragments like ".f398.mp4".
    .map((f) => ({ f, frag: /\.f\d+\.\w+$/i.test(f), size: safeSize(path.join(dir, f)) }))
    .sort((a, b) => Number(a.frag) - Number(b.frag) || b.size - a.size);
  return media.length ? path.join(dir, media[0].f) : null;
}

function safeSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/**
 * Spawns yt-dlp to download + merge into a single MP4, reporting progress via
 * the onProgress callback. Returns a handle whose `done` resolves to the file path.
 */
export function startDownload(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  outputDir: string,
  onProgress: (p: ProgressUpdate) => void,
): DownloadHandle {
  const outTemplate = path.join(outputDir, '%(title).80s.%(ext)s');

  // NOTE: we intentionally do NOT use `--print after_move:filepath` — it makes
  // yt-dlp suppress the live progress lines on stdout. Instead we parse progress
  // directly and discover the produced file by scanning the (per-job) directory.
  const args = [
    '-f', buildSelector(quality, mode),
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', config.ffmpegPath,
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-part',
    '--progress',
    '--restrict-filenames',
    ...youtubeHardeningArgs(),
    '-o', outTemplate,
    url,
  ];

  const child = spawn(config.ytdlpPath, args, { windowsHide: true });
  let stderr = '';

  // Progress state across the (possibly two) streams.
  let streamTotal = 1; // updated from the "format(s): a+b" line
  let streamsStarted = 0; // incremented on each "Destination:" line
  let lastPercent = 0; // monotonic guard so the bar never jumps backwards

  const emit = (raw: number, speed: string | null, eta: string | null) => {
    const idx = Math.max(1, streamsStarted);
    // Map per-stream % into a smooth overall 0..DOWNLOAD_BUDGET.
    const overall = ((idx - 1 + raw / 100) / streamTotal) * DOWNLOAD_BUDGET;
    lastPercent = Math.max(lastPercent, Math.min(DOWNLOAD_BUDGET, overall));
    onProgress({
      percent: lastPercent,
      speed,
      eta,
      stage: 'downloading',
      streamIndex: idx,
      streamTotal,
    });
  };

  /** A single line of yt-dlp output (from stdout or stderr). */
  const handleLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;

    const fmt = FORMAT_RE.exec(line);
    if (fmt) {
      streamTotal = Math.max(1, fmt[1].split('+').length);
      return;
    }
    if (DEST_RE.test(line)) {
      streamsStarted = Math.min(streamTotal, streamsStarted + 1);
      return;
    }
    if (MERGE_RE.test(line)) {
      lastPercent = Math.max(lastPercent, DOWNLOAD_BUDGET);
      onProgress({ percent: lastPercent, speed: null, eta: null, stage: 'merging', streamIndex: streamTotal, streamTotal });
      return;
    }
    const m = PROGRESS_RE.exec(line);
    if (m) emit(parseFloat(m[1]), m[2] ?? null, m[3] ?? null);
  };

  // yt-dlp emits progress on stdout with --newline; updates may be separated by
  // \r or \n, so split on either. Parse both streams to be safe across versions.
  const pump = (chunk: Buffer) => {
    for (const part of chunk.toString().split(/[\r\n]+/)) handleLine(part);
  };

  const done = new Promise<string>((resolve, reject) => {
    child.stdout.on('data', pump);
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      pump(d);
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp binary not found. Is it installed and on PATH?', 'NO_BINARY'));
      } else {
        reject(new YtDlpError(err.message, 'FAILED'));
      }
    });

    child.on('close', (code) => {
      const finalPath = code === 0 ? findOutputFile(outputDir) : null;
      if (code === 0 && finalPath) {
        onProgress({ percent: 100, speed: null, eta: null, stage: 'done', streamIndex: streamTotal, streamTotal });
        resolve(finalPath);
      } else {
        logger.warn('yt-dlp download failed:', stderr.slice(0, 500));
        reject(new YtDlpError(downloadFailureMessage(stderr), 'FAILED'));
      }
    });
  });

  return {
    outputDir,
    cancel: () => child.kill('SIGKILL'),
    done,
  };
}
