import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, currentProxy, rotateProxy } from '../config.js';
import { saveInfoJson, getFreshInfoJson, invalidateInfoJson } from './infoJsonCache.js';
import { getCookiesStatus, getUsableCookiesPath } from '../utils/cookies.js';
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
  format_id?: string;
  ext?: string;
  url?: string;
  protocol?: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number; // total bitrate kbps
}

function isH264Vcodec(vcodec: string | undefined): boolean {
  const l = (vcodec ?? '').toLowerCase();
  return l.includes('avc') || l.includes('h264') || l.startsWith('avc1');
}

/**
 * Pick the fastest IG/FB format from a cached info-json dump — avoids yt-dlp
 * re-scanning and prevents accidentally selecting HEVC (2+ min transcode).
 */
export function pickBestSocialFormat(
  infoJsonPath: string,
  maxHeight: number,
  preferSmallest = false,
): { selector: string; singleFileH264: boolean } | null {
  let raw: RawDump;
  try {
    raw = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
  } catch {
    return null;
  }

  const formats = raw.formats ?? [];
  const sizeOf = (f: RawFormat) => f.filesize ?? f.filesize_approx ?? (f.tbr ?? 0) * 1000;

  const progressive = formats.filter((f) => {
    if (!f.format_id || !f.url) return false;
    const h = f.height ?? 9999;
    if (h > maxHeight) return false;
    if (!isH264Vcodec(f.vcodec)) return false;
    if ((f.acodec ?? 'none') === 'none') return false;
    return true;
  });

  if (progressive.length > 0) {
    progressive.sort((a, b) => {
      if (preferSmallest) return sizeOf(a) - sizeOf(b);
      return (b.height ?? 0) - (a.height ?? 0) || sizeOf(a) - sizeOf(b);
    });
    return { selector: String(progressive[0].format_id), singleFileH264: true };
  }

  const videos = formats.filter(
    (f) => f.format_id && isH264Vcodec(f.vcodec) && (f.height ?? 9999) <= maxHeight,
  );
  const audios = formats.filter((f) => f.format_id && (f.acodec ?? 'none') !== 'none');
  if (videos.length && audios.length) {
    videos.sort((a, b) =>
      preferSmallest
        ? sizeOf(a) - sizeOf(b)
        : (b.height ?? 0) - (a.height ?? 0) || sizeOf(a) - sizeOf(b),
    );
    audios.sort((a, b) => sizeOf(a) - sizeOf(b));
    return {
      selector: `${videos[0].format_id!}+${audios[0].format_id!}`,
      singleFileH264: false,
    };
  }

  return null;
}

class YtDlpError extends Error {
  constructor(message: string, public readonly code: 'UNAVAILABLE' | 'TOO_LONG' | 'NO_BINARY' | 'FAILED' | 'BLOCKED') {
    super(message);
  }
}
export { YtDlpError };

/** True when yt-dlp's stderr indicates an IP/bot block worth rotating proxy for. */
function isBlockedStderr(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return (
    s.includes("sign in to confirm you're not a bot") ||
    s.includes('not a bot') ||
    s.includes('bot detected') ||
    s.includes('http error 429') ||
    s.includes('too many requests') ||
    s.includes('http error 403')
  );
}

/** yt-dlp flags tuned for faster metadata extraction (info-only, no download). */
const INFO_ARGS = [
  '-J',
  '--no-warnings',
  '--no-playlist',
  '--no-check-formats',
] as const;

/** Player clients to try without cookies or PO token (datacenter IPs). */
const YOUTUBE_PLAYER_CLIENTS = ['web_safari', 'tv_embedded', 'mweb', 'android', 'default'] as const;

// Client order for authenticated (cookies) sessions. Through a proxy / on
// flagged IPs, YouTube serves the `web` and `mweb` clients a DEGRADED format
// set (often 360p only or none), which breaks high-quality downloads with
// "Requested format is not available". The `default`, `tv_embedded` and
// `web_safari` clients return the full ladder (up to 4K), so we lead with those
// and keep web/mweb only as last-resort fallbacks.
const YOUTUBE_COOKIES_CLIENTS = ['default', 'web_safari', 'tv_embedded', 'mweb', 'web'] as const;

/** Default client when a PO token is configured (yt-dlp recommends mweb + PO token). */
const YOUTUBE_PO_TOKEN_CLIENT = 'mweb';

/** Build the youtube: extractor-args value (player_client + optional po_token). */
function youtubeExtractorArgValue(playerClient: string): string {
  const parts = [`player_client=${playerClient}`];
  if (config.ytdlpPoToken) {
    parts.push(`po_token=${config.ytdlpPoToken}`);
  }
  return parts.join(';');
}

/** Resolve which YouTube player client(s) to try for info/download. */
function youtubeClientsToTry(hasCookies: boolean): readonly string[] {
  // Base fallback list, best-first, for the current auth situation.
  const base = config.ytdlpPoToken
    ? [YOUTUBE_PO_TOKEN_CLIENT, ...YOUTUBE_COOKIES_CLIENTS]
    : hasCookies
      ? YOUTUBE_COOKIES_CLIENTS
      : YOUTUBE_PLAYER_CLIENTS;

  // An explicitly configured client is tried first, but we still fall back to
  // the rest of the list so one failing client can't break every download.
  const ordered =
    config.youtubePlayerClient !== 'default'
      ? [config.youtubePlayerClient, ...base]
      : [...base];

  return [...new Set(ordered)];
}

/**
 * Args shared by every yt-dlp invocation (info + download) to survive YouTube's
 * bot-detection on cloud/datacenter IPs: a configurable player client and, when
 * provided, an authenticated cookies file and/or PO token. The `youtube:`
 * namespace makes the extractor-arg a no-op for other platforms.
 */
function youtubeHardeningArgs(playerClient: string): string[] {
  const args = ['--extractor-args', `youtube:${youtubeExtractorArgValue(playerClient)}`];
  // BgUtils PO-token provider: the plugin auto-connects to the in-container
  // provider on 127.0.0.1:4416; only pass a base_url when overriding it.
  if (config.ytdlpPotBaseUrl) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${config.ytdlpPotBaseUrl}`);
  }
  // Use a writable copy: yt-dlp rewrites the cookies file on exit and Render's
  // secret mount is read-only (crashes the process otherwise).
  const cookiesPath = getUsableCookiesPath();
  if (cookiesPath) args.push('--cookies', cookiesPath);
  // A proxy routes every request through a trusted IP — the most effective fix
  // for "Sign in to confirm you're not a bot". currentProxy() is sticky (one
  // stable IP) so an authenticated session doesn't hop IPs and look bot-like.
  const proxy = currentProxy();
  if (proxy) args.push('--proxy', proxy);
  return args;
}

function ytDlpFailureMessage(stderr: string): string {
  const s = stderr.toLowerCase();
  // Proxy-level failure (before we even reach YouTube). 402 = the proxy plan is
  // out of bandwidth/credit; tunnel/proxy errors mean the proxy itself refused.
  if (
    s.includes('payment required') ||
    s.includes('402') ||
    s.includes('tunnel connection failed') ||
    s.includes('proxyerror') ||
    s.includes('cannot connect to proxy')
  ) {
    return 'The download proxy is unavailable (it returned a connection/payment error). The proxy plan is likely out of bandwidth or credit — top it up or update YTDLP_PROXY, then redeploy.';
  }
  if (s.includes('po token') || (s.includes('http error 403') && s.includes('youtube'))) {
    if (config.ytdlpPoToken) {
      return 'YouTube rejected the PO Token (expired or wrong format). Refresh YTDLP_PO_TOKEN — tokens can be per-video and short-lived. See yt-dlp PO Token Guide.';
    }
    return 'YouTube requires a PO Token for this client. Set YTDLP_PO_TOKEN on the server (mweb client recommended). See https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide';
  }
  if (s.includes("sign in to confirm you're not a bot") || s.includes('not a bot') || s.includes('bot detected')) {
    const cookies = getCookiesStatus();
    if (cookies.path && cookies.exists) {
      if (!cookies.hasGoogle || !cookies.hasYoutube) {
        return 'Cookies file is missing Google or YouTube entries. Re-export cookies from both accounts.google.com and youtube.com, then redeploy.';
      }
      return 'YouTube blocked this server even with cookies. Re-export a fresh cookies.txt (after logging in on Google + YouTube) and redeploy. Render datacenter IPs are often blocked by YouTube.';
    }
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
function runJson(args: readonly string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
      reject(new YtDlpError('Timed out reading video metadata.', 'FAILED'));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp binary not found. Is it installed and on PATH?', 'NO_BINARY'));
      } else {
        reject(new YtDlpError(err.message, 'FAILED'));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout);
      logger.warn('yt-dlp info failed:', stderr.slice(0, 500));
      reject(new YtDlpError(ytDlpFailureMessage(stderr), isBlockedStderr(stderr) ? 'BLOCKED' : 'UNAVAILABLE'));
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

/** In-flight extractions — /api/info and /api/download share one yt-dlp -J pass. */
const infoJsonInflight = new Map<string, Promise<void>>();

async function extractAndCacheInfoJson(url: string): Promise<void> {
  const platform = detectPlatform(url);
  const isYoutube = platform?.id === 'youtube';
  const cookies = getCookiesStatus();
  const clients = isYoutube ? youtubeClientsToTry(cookies.exists) : [config.youtubePlayerClient];

  const maxProxyTries = Math.min(Math.max(config.proxies.length, 1), 5);
  let lastError: YtDlpError | undefined;

  for (let proxyTry = 0; proxyTry < maxProxyTries; proxyTry++) {
    let blocked = false;
    for (const client of clients) {
      try {
        const stdout = await runJson([...INFO_ARGS, ...youtubeHardeningArgs(client), url]);
        saveInfoJson(url, stdout, currentProxy() ?? '');
        return;
      } catch (err) {
        if (!(err instanceof YtDlpError)) throw err;
        lastError = err;
        if (err.code === 'BLOCKED') {
          blocked = true;
          break;
        }
      }
    }

    if (blocked && config.proxies.length > 1 && proxyTry < maxProxyTries - 1) {
      const next = rotateProxy();
      logger.info(
        `Info blocked on proxy; rotating to ${next ? new URL(next).host : 'none'} (try ${proxyTry + 2}/${maxProxyTries})`,
      );
      continue;
    }
    break;
  }

  throw lastError ?? new YtDlpError('Could not read that video.', 'UNAVAILABLE');
}

/**
 * Ensure a fresh info-json dump exists for this URL. Dedupes concurrent callers
 * (/api/info on paste + /api/download) so Instagram never pays for two extractions.
 */
export function ensureInfoJsonCache(url: string): Promise<void> {
  const proxy = currentProxy() ?? '';
  if (getFreshInfoJson(url, proxy)) return Promise.resolve();

  let inflight = infoJsonInflight.get(url);
  if (!inflight) {
    inflight = extractAndCacheInfoJson(url).finally(() => infoJsonInflight.delete(url));
    infoJsonInflight.set(url, inflight);
  }
  return inflight;
}

/** Fetches metadata + computes the four quality cards for a URL. */
export async function fetchInfo(url: string): Promise<VideoInfo> {
  const proxy = currentProxy() ?? '';
  const cachedJson = getFreshInfoJson(url, proxy);
  if (cachedJson) {
    try {
      const stdout = fs.readFileSync(cachedJson, 'utf8');
      return parseInfoDump(stdout);
    } catch {
      invalidateInfoJson(url);
    }
  }

  await ensureInfoJsonCache(url);
  const fresh = getFreshInfoJson(url, currentProxy() ?? '');
  if (!fresh) throw new YtDlpError('Could not read that video.', 'UNAVAILABLE');
  return parseInfoDump(fs.readFileSync(fresh, 'utf8'));
}

/**
 * Lightweight metadata for /api/info/preview (Instagram/Facebook).
 * One yt-dlp pass, caches info-json for the subsequent download.
 */
export async function fetchQuickPreview(url: string): Promise<VideoInfo | null> {
  try {
    await ensureInfoJsonCache(url);
    const fresh = getFreshInfoJson(url, currentProxy() ?? '');
    if (!fresh) return null;
    const info = parseInfoDump(fs.readFileSync(fresh, 'utf8'));
    return {
      id: info.id,
      title: info.title,
      author: info.author,
      durationSeconds: info.durationSeconds,
      thumbnail: info.thumbnail,
      formats: [],
    };
  } catch {
    return null;
  }
}

/** Read preview fields from a warm info-json cache (no yt-dlp spawn). */
export function readCachedVideoInfo(url: string): VideoInfo | null {
  const fresh = getFreshInfoJson(url, currentProxy() ?? '');
  if (!fresh) return null;
  try {
    return parseInfoDump(fs.readFileSync(fresh, 'utf8'));
  } catch {
    return null;
  }
}

/** Poll until info-json extraction finishes and a thumbnail is available. */
export async function waitForCachedVideoInfo(url: string, maxWaitMs = 15000): Promise<VideoInfo | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const info = readCachedVideoInfo(url);
    if (info?.thumbnail) return info;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
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

/**
 * Kill a download that produces no output for this long. yt-dlp prints
 * extraction + per-second progress lines while healthy, so silence this long
 * means a stalled connection (commonly a slow/blocked proxy). The watchdog is
 * paused during the local ffmpeg merge, which can be legitimately quiet.
 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 90_000;

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

/** IG/FB need low RAM; YouTube benefits from parallel fragment downloads. */
function downloadTuning(
  url: string,
  fast?: boolean,
): { httpChunkSize: string; concurrentFragments: string } {
  const platform = detectPlatform(url)?.id;
  if (platform === 'instagram' || platform === 'facebook') {
    return fast
      ? { httpChunkSize: '5M', concurrentFragments: '6' }
      : { httpChunkSize: '4M', concurrentFragments: '4' };
  }
  return { httpChunkSize: '5M', concurrentFragments: '6' };
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
  options?: { fast?: boolean },
): DownloadHandle {
  const outTemplate = path.join(outputDir, '%(title).80s.%(ext)s');
  const cookies = getCookiesStatus();
  const [youtubeClient] = youtubeClientsToTry(cookies.exists);

  // Reuse the extraction from /api/info (same proxy, still fresh) so the download
  // skips a second ~20s extraction and starts transferring almost immediately.
  const cachedInfoJson = getFreshInfoJson(url, currentProxy() ?? '');
  const usedCache = Boolean(cachedInfoJson);
  if (usedCache) logger.info('Download reusing cached info (skipping re-extraction)');

  const platformId = detectPlatform(url)?.id;
  const fast = options?.fast ?? false;
  const tuning = downloadTuning(url, fast);
  const igFbMaxHeight =
    platformId === 'instagram' || platformId === 'facebook'
      ? fast
        ? 480
        : quality.height
      : undefined;

  let formatArg = buildSelector(quality, mode, platformId, { maxHeight: igFbMaxHeight });
  let singleFileH264 = false;

  if (cachedInfoJson && (platformId === 'instagram' || platformId === 'facebook')) {
    const picked = pickBestSocialFormat(cachedInfoJson, igFbMaxHeight ?? quality.height, fast);
    if (picked) {
      formatArg = picked.selector;
      singleFileH264 = picked.singleFileH264;
      logger.info(`IG/FB cached format ${formatArg} (single H.264=${singleFileH264})`);
    }
  }

  const skipMergePost = fast && singleFileH264;

  const args = [
    '-f',
    formatArg,
    ...(skipMergePost ? [] : ['--merge-output-format', 'mp4']),
    // Only pass --ffmpeg-location for a real path. A bare name like "ffmpeg"
    // is rejected by yt-dlp ("ffmpeg-location ffmpeg does not exist") and makes
    // it SKIP the merge — producing a video-only file with no audio. Omitting
    // the flag lets yt-dlp find ffmpeg on PATH (the normal case).
    ...(/[\\/]/.test(config.ffmpegPath) ? ['--ffmpeg-location', config.ffmpegPath] : []),
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-part',
    '--progress',
    '--restrict-filenames',
    '--postprocessor-args', 'ffmpeg:-movflags +faststart',
    '--http-chunk-size', tuning.httpChunkSize,
    '--concurrent-fragments', tuning.concurrentFragments,
    '--retries', fast ? '3' : '10',
    '--fragment-retries', fast ? '5' : '20',
    '--retry-sleep', 'linear=1::5',
    '--socket-timeout', '30',
    ...youtubeHardeningArgs(youtubeClient ?? config.youtubePlayerClient),
    '-o', outTemplate,
    // Load the cached extraction when available; otherwise extract from the URL.
    ...(cachedInfoJson ? ['--load-info-json', cachedInfoJson] : [url]),
  ];

  // Prefer highest resolution when multiple formats match (esp. YouTube DASH).
  if (platformId === 'youtube') {
    args.push('-S', 'res,quality,vcodec:vp9,vcodec:av1');
  } else if ((platformId === 'instagram' || platformId === 'facebook') && !singleFileH264) {
    args.push('-S', 'vcodec:h264,res,quality');
  }

  // NOTE: we intentionally do NOT use `--print after_move:filepath` — it makes
  // yt-dlp suppress the live progress lines on stdout. Instead we parse progress
  // directly and discover the produced file by scanning the (per-job) directory.

  const child = spawn(config.ytdlpPath, args, { windowsHide: true });
  let stderr = '';

  // Instant feedback — yt-dlp is silent during extraction; don't leave UI at 0% for 30s+.
  onProgress({
    percent: 1,
    speed: null,
    eta: null,
    stage: 'downloading',
    streamIndex: 1,
    streamTotal: 1,
  });

  // Progress state across the (possibly two) streams.
  let streamTotal = 1; // updated from the "format(s): a+b" line
  let streamsStarted = 0; // incremented on each "Destination:" line
  let lastPercent = 0; // monotonic guard so the bar never jumps backwards
  let merging = false; // pause the idle watchdog during the (quiet) ffmpeg merge

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
      merging = true;
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
    let settled = false;
    let idleTimer: NodeJS.Timeout;

    // Re-arm on every line of yt-dlp output. If it goes silent for the timeout
    // (and we're not merging), the connection has stalled — kill it so the user
    // gets a retryable error instead of an endless spinner.
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (merging) return armIdle(); // ffmpeg merge can be legitimately quiet
        if (settled) return;
        settled = true;
        logger.warn('yt-dlp download stalled (no output for 90s) — killing process');
        try {
          child.kill('SIGKILL');
        } catch {
          /* already exited */
        }
        if (usedCache) invalidateInfoJson(url); // re-extract on retry in case URLs went stale
        if (config.proxies.length > 1) rotateProxy();
        reject(
          new YtDlpError(
            'The download stalled — the proxy may be slow or blocked. Please try again; it will use a different proxy.',
            'BLOCKED',
          ),
        );
      }, DOWNLOAD_IDLE_TIMEOUT_MS);
    };

    const onData = (d: Buffer, isErr: boolean) => {
      armIdle();
      if (isErr) stderr += d.toString();
      pump(d);
    };

    child.stdout.on('data', (d: Buffer) => onData(d, false));
    child.stderr.on('data', (d: Buffer) => onData(d, true));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp binary not found. Is it installed and on PATH?', 'NO_BINARY'));
      } else {
        reject(new YtDlpError(err.message, 'FAILED'));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      const finalPath = code === 0 ? findOutputFile(outputDir) : null;
      if (code === 0 && finalPath) {
        onProgress({ percent: 100, speed: null, eta: null, stage: 'done', streamIndex: streamTotal, streamTotal });
        // YouTube tends to flag a datacenter IP after it's used, so move the next
        // video onto a fresh IP from the pool instead of reusing this one.
        if (config.proxies.length > 1) rotateProxy();
        resolve(finalPath);
      } else {
        logger.warn('yt-dlp download failed:', stderr.slice(0, 500));
        if (usedCache) invalidateInfoJson(url); // cached URLs may be stale — force fresh extraction
        if (config.proxies.length > 1) rotateProxy();
        reject(new YtDlpError(downloadFailureMessage(stderr), isBlockedStderr(stderr) ? 'BLOCKED' : 'FAILED'));
      }
    });

    armIdle();
  });

  return {
    outputDir,
    cancel: () => child.kill('SIGKILL'),
    done,
  };
}
