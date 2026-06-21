import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config, currentProxy } from './config.js';
import { startDownload, ensureInfoJsonCache, YtDlpError, type ProgressUpdate } from './services/ytdlp.js';
import { getQuality, type CodecMode, type QualityDef } from './services/formats.js';
import { detectPlatform, type PlatformId } from './services/platform.js';
import { needsGalleryNormalize, normalizeForGallery, canServeDirectToGallery } from './services/normalizeVideo.js';
import { getFreshInfoJson } from './services/infoJsonCache.js';
import { logger } from './utils/logger.js';

type JobStatus = 'running' | 'ready' | 'error';

export interface Job {
  id: string;
  dir: string;
  status: JobStatus;
  progress: ProgressUpdate;
  filePath?: string;
  errorMessage?: string;
  createdAt: number;
  cancel: () => void;
  /** Source platform — used when serving the file (gallery normalize). */
  platformId?: PlatformId;
  /** Cached H.264 path after gallery normalize (Instagram/Facebook). */
  galleryPath?: string;
  /** Shared in-flight normalize promise (avoid duplicate ffmpeg runs). */
  galleryNormalize?: Promise<string>;
  /** Set when gallery transcode fails — client may fall back to the raw file. */
  galleryNormalizeFailed?: boolean;
  /** Mobile fast path — smaller IG/FB file, skip normalize retry. */
  fast?: boolean;
  /** Dedupe key for prefetch / reuse. */
  cacheKey?: string;
  /** SSE listeners subscribed to this job's progress. */
  listeners: Set<(p: ProgressUpdate | { done: true } | { error: string }) => void>;
}

const jobs = new Map<string, Job>();
const jobsByKey = new Map<string, string>();

function jobCacheKey(url: string, quality: QualityDef, mode: CodecMode, fast?: boolean): string {
  return `${url.trim()}|${quality.id}|${mode}|${fast ? 'fast' : 'normal'}`;
}

/** Return an in-flight or finished prefetch job for the same url/settings. */
export function findReusableJob(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  fast?: boolean,
): Job | undefined {
  const id = jobsByKey.get(jobCacheKey(url, quality, mode, fast));
  if (!id) return undefined;
  const job = jobs.get(id);
  if (!job || job.status === 'error') {
    jobsByKey.delete(jobCacheKey(url, quality, mode, fast));
    return undefined;
  }
  return job;
}

function countRunningJobs(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running') n += 1;
  }
  return n;
}

/** Cap IG/FB quality on low-memory hosts — HEVC transcode exceeds 512 MB. */
function effectiveQuality(url: string, quality: QualityDef): QualityDef {
  const platform = detectPlatform(url)?.id;
  if (platform === 'instagram' || platform === 'facebook') {
    if (quality.height > 720) {
      return getQuality('720') ?? quality;
    }
  }
  return quality;
}

function emit(job: Job, payload: ProgressUpdate | { done: true } | { error: string }) {
  for (const fn of job.listeners) fn(payload);
}

/** True when an Instagram/Facebook file is ready to serve for "Save Video". */
export function isGalleryReady(job: Job): boolean {
  if (!needsGalleryNormalize(job.platformId)) return true;
  return Boolean(job.galleryPath);
}

/** Start H.264 transcode in the background — never block the download progress UI. */
export function warmGalleryNormalize(job: Job): void {
  if (!job.filePath || !needsGalleryNormalize(job.platformId)) return;
  if (job.galleryNormalize || job.galleryPath) return;

  const input = job.filePath;
  job.galleryNormalizeFailed = false;
  job.galleryNormalize = normalizeForGallery(input, job.dir, job.fast)
    .then((normalized) => {
      job.galleryPath = normalized;
      job.filePath = normalized;
      job.galleryNormalizeFailed = false;
      return normalized;
    })
    .catch((err) => {
      job.galleryNormalize = undefined;
      job.galleryNormalizeFailed = true;
      logger.warn('Background gallery normalize failed:', (err as Error).message);
      throw err;
    });
}

const FRESH_PROGRESS: ProgressUpdate = {
  percent: 0,
  speed: null,
  eta: null,
  stage: 'downloading',
  streamIndex: 1,
  streamTotal: 1,
};

/** Creates a temp dir, spawns the download (with auto-retry), and tracks it as a job. */
export async function createJob(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  options?: { fast?: boolean; reuse?: boolean },
): Promise<Job> {
  const q = effectiveQuality(url, quality);
  const cacheKey = jobCacheKey(url, q, mode, options?.fast);

  if (options?.reuse) {
    const existing = findReusableJob(url, q, mode, options.fast);
    if (existing) {
      logger.info(`Reusing download job ${existing.id} (${existing.status})`);
      return existing;
    }
  }

  if (countRunningJobs() >= config.maxConcurrentJobs) {
    const existing = findReusableJob(url, q, mode, options?.fast);
    if (existing) return existing;
    throw new YtDlpError(
      'The server is busy with another download. Wait a moment and try again.',
      'FAILED',
    );
  }

  if (q.id !== quality.id) {
    logger.info(`Low-memory cap: ${quality.label} → ${q.label} for ${detectPlatform(url)?.id ?? 'video'}`);
  }

  await fsp.mkdir(config.tmpRoot, { recursive: true });
  const id = nanoid();
  const dir = path.join(config.tmpRoot, id);
  await fsp.mkdir(dir, { recursive: true });

  const job: Job = {
    id,
    dir,
    status: 'running',
    progress: { ...FRESH_PROGRESS },
    createdAt: Date.now(),
    platformId: detectPlatform(url)?.id,
    fast: options?.fast ?? false,
    cacheKey,
    cancel: () => undefined, // replaced per attempt
    listeners: new Set(),
  };
  jobs.set(id, job);
  jobsByKey.set(cacheKey, id);

  void runWithRetry(job, url, q, mode);
  return job;
}

/** Empties a job's temp dir between retry attempts (keeps the dir itself). */
async function clearDir(dir: string): Promise<void> {
  try {
    const entries = await fsp.readdir(dir);
    await Promise.all(
      entries.map((f) => fsp.rm(path.join(dir, f), { recursive: true, force: true }).catch(() => undefined)),
    );
  } catch {
    /* dir already gone */
  }
}

/**
 * Runs the download and AUTO-RETRIES on a YouTube/proxy block (the error users
 * used to recover from by refreshing + clicking again). Each failed attempt has
 * already rotated to a fresh proxy IP, so a retry usually succeeds — silently,
 * without the user seeing an error.
 */
async function runWithRetry(job: Job, url: string, quality: QualityDef, mode: CodecMode): Promise<void> {
  const maxAttempts = config.proxies.length > 1 ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxy = currentProxy() ?? '';
    const hasCachedInfo = Boolean(getFreshInfoJson(url, proxy));

    if (!hasCachedInfo) {
      job.progress = { percent: 1, speed: null, eta: null, stage: 'downloading', streamIndex: 1, streamTotal: 1 };
      emit(job, job.progress);
      try {
        await ensureInfoJsonCache(url);
      } catch (err) {
        logger.warn('Info-json warm failed — download will extract inline:', (err as Error).message);
      }
    } else {
      logger.info('Download skipping info-json warm — cache hit');
    }

    const handle = startDownload(url, quality, mode, job.dir, (p) => {
      const j = jobs.get(job.id);
      if (!j) return;
      j.progress = p;
      emit(j, p);
    }, { fast: job.fast });
    job.cancel = handle.cancel;

    try {
      const filePath = await handle.done;
      job.status = 'ready';
      job.filePath = filePath;
      job.progress = { ...job.progress, percent: 100, speed: null, eta: null, stage: 'done' };

      if (needsGalleryNormalize(job.platformId)) {
        if (await canServeDirectToGallery(filePath)) {
          job.galleryPath = filePath;
          logger.info('Gallery skip remux — H.264 + faststart already present');
        } else {
          warmGalleryNormalize(job);
          job.progress = {
            percent: 99,
            speed: null,
            eta: null,
            stage: 'merging',
            streamIndex: 1,
            streamTotal: 1,
          };
          emit(job, job.progress);
          try {
            if (job.galleryNormalize) await job.galleryNormalize;
          } catch (err) {
            if (job.fast) {
              job.status = 'error';
              job.errorMessage =
                'Could not prepare this video for your gallery. Try again or pick 720p.';
              emit(job, { error: job.errorMessage });
              scheduleDestroyJob(job.id);
              return;
            }
            logger.warn('Gallery normalize failed, retrying once:', (err as Error).message);
            job.galleryNormalize = undefined;
            job.galleryNormalizeFailed = false;
            warmGalleryNormalize(job);
            try {
              if (job.galleryNormalize) await job.galleryNormalize;
            } catch (retryErr) {
              job.status = 'error';
              job.errorMessage =
                'Could not prepare this video for your gallery. Try again or pick 720p.';
              emit(job, { error: job.errorMessage });
              scheduleDestroyJob(job.id);
              return;
            }
          }
        }
      }

      job.progress = { ...job.progress, percent: 100, stage: 'done' };
      emit(job, { done: true });
      return;
    } catch (err) {
      const blocked = err instanceof YtDlpError && err.code === 'BLOCKED';
      // Retry only block/stall failures, only if the job is still alive.
      if (blocked && attempt < maxAttempts && jobs.has(job.id)) {
        logger.info(`Download blocked (attempt ${attempt}/${maxAttempts}) — auto-retrying on a fresh proxy: ${job.id}`);
        await clearDir(job.dir);
        job.progress = { ...FRESH_PROGRESS };
        emit(job, job.progress); // reset UI to "preparing" instead of erroring
        continue;
      }
      job.status = 'error';
      job.errorMessage = (err as Error).message;
      emit(job, { error: (err as Error).message });
      scheduleDestroyJob(job.id);
      return;
    }
  }
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** Removes a job and deletes its temp directory. */
export async function destroyJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  if (job.cacheKey) jobsByKey.delete(job.cacheKey);
  jobs.delete(id);
  try {
    job.cancel();
  } catch {
    /* already exited */
  }
  await fsp.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Keep failed jobs alive briefly so /status can return the real error (not 404). */
function scheduleDestroyJob(id: string, delayMs = 10 * 60_000): void {
  setTimeout(() => void destroyJob(id), delayMs).unref();
}

/**
 * Periodically removes jobs older than the TTL — covers abandoned downloads
 * and files the client never picked up. Also cleans orphaned dirs on boot.
 */
export function startSweeper(): void {
  const sweep = async () => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.createdAt > config.tmpTtlMs) {
        logger.info(`Sweeping expired job ${id}`);
        await destroyJob(id);
      }
    }
  };
  // Boot cleanup: nuke any leftover temp root from a previous crash.
  if (fs.existsSync(config.tmpRoot)) {
    fsp.rm(config.tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  setInterval(() => void sweep(), 5 * 60 * 1000).unref();
}
