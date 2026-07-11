import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config, currentProxy } from './config.js';
import { startDownload, ensureInfoJsonCache, YtDlpError, type ProgressUpdate } from './services/ytdlp.js';
import { getQuality, type CodecMode, type QualityDef } from './services/formats.js';
import { detectPlatform, type PlatformId } from './services/platform.js';
import {
  needsGalleryNormalize,
  normalizeForGallery,
  galleryNormalizeOptions,
  canServeDirectToGallery,
  probeVideoHeight,
  trimVideo,
} from './services/normalizeVideo.js';
import type { ClipRange } from './utils/clip.js';
import { getFreshInfoJson } from './services/infoJsonCache.js';
import { objectStoreEnabled, storeVideo } from './services/objectStore.js';
import { logger } from './utils/logger.js';
import { logDownload, HIGH_RES_MIN_HEIGHT } from './utils/downloadLogger.js';

type JobStatus = 'queued' | 'running' | 'ready' | 'error';

export interface Job {
  id: string;
  dir: string;
  status: JobStatus;
  progress: ProgressUpdate;
  filePath?: string;
  errorMessage?: string;
  createdAt: number;
  cancel: () => void;
  /** Download target — kept on queued jobs until a worker slot opens. */
  url?: string;
  quality?: QualityDef;
  mode?: CodecMode;
  /** Source platform — used when serving the file (gallery normalize). */
  platformId?: PlatformId;
  /** Cached H.264 path after gallery normalize (Instagram/Facebook). */
  galleryPath?: string;
  /** Shared in-flight normalize promise (avoid duplicate ffmpeg runs). */
  galleryNormalize?: Promise<string | undefined>;
  /** Set when gallery transcode fails — client may fall back to the raw file. */
  galleryNormalizeFailed?: boolean;
  /** Mobile fast path — smaller IG/FB file, skip normalize retry. */
  fast?: boolean;
  /** Requested output height (720–2160) — drives mobile VP9/HEVC gallery prep. */
  requestedHeight?: number;
  /** Native app requested H.264 gallery prep — mobile browsers skip this. */
  galleryPrep?: boolean;
  /** Cap source download + transcode height (mobile browser 2K/4K → 1080p for speed). */
  galleryMaxHeight?: number;
  /** Dedupe key for prefetch / reuse. */
  cacheKey?: string;
  /** Object-store key once the finished file is uploaded (R2 cache). */
  storedKey?: string;
  /** In-flight background upload to the object store. */
  storeUpload?: Promise<string | null>;
  /** Verified output height (ffprobe) after download completes. */
  outputHeight?: number | null;
  /** Optional clip range applied after the full download. */
  clip?: ClipRange | null;
  /** Client IP for download tracking */
  ip?: string;
  /** SSE listeners subscribed to this job's progress. */
  listeners: Set<(p: ProgressUpdate | { done: true; outputHeight?: number | null } | { error: string }) => void>;
}

const jobs = new Map<string, Job>();
const jobsByKey = new Map<string, string>();

export function jobCacheKey(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  fast?: boolean,
  clip?: ClipRange | null,
): string {
  const clipPart = clip ? `clip:${clip.startTime}-${clip.endTime}` : 'full';
  return `${url.trim()}|${quality.id}|${mode}|${fast ? 'fast' : 'normal'}|${clipPart}`;
}

/** Return a finished prefetch job for the same url/settings (ready to serve). */
export function findReusableJob(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  fast?: boolean,
  clip?: ClipRange | null,
): Job | undefined {
  const id = jobsByKey.get(jobCacheKey(url, quality, mode, fast, clip));
  if (!id) return undefined;
  const job = jobs.get(id);
  if (!job || job.status === 'error') {
    jobsByKey.delete(jobCacheKey(url, quality, mode, fast, clip));
    return undefined;
  }
  // Re-attaching to a stalled "running" job (common at 1% on 4K) freezes the UI.
  if (job.status !== 'ready') return undefined;
  return job;
}

function countRunningJobs(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running') n += 1;
  }
  return n;
}

function runningJobsByIp(ip: string): Job[] {
  return [...jobs.values()].filter((j) => j.status === 'running' && j.ip === ip);
}

function countRunningHighResJobs(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running' && (job.requestedHeight ?? 0) >= HIGH_RES_MIN_HEIGHT) n += 1;
  }
  return n;
}

function countQueuedJobs(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === 'queued') n += 1;
  }
  return n;
}

function sortedQueuedJobs(): Job[] {
  return [...jobs.values()]
    .filter((j) => j.status === 'queued')
    .sort((a, b) => {
      const ah = a.requestedHeight ?? 0;
      const bh = b.requestedHeight ?? 0;
      if (ah !== bh) return ah - bh;
      return a.createdAt - b.createdAt;
    });
}

function canStartJob(quality: QualityDef): boolean {
  if (countRunningJobs() >= config.maxConcurrentJobs) return false;
  if (
    quality.height >= HIGH_RES_MIN_HEIGHT &&
    countRunningHighResJobs() >= config.maxConcurrentHighResJobs
  ) {
    return false;
  }
  return true;
}

function queuedProgress(position: number, total: number): ProgressUpdate {
  return {
    percent: 0,
    speed: null,
    eta: null,
    stage: 'queued',
    streamIndex: 1,
    streamTotal: 1,
    queuePosition: position,
    queueTotal: total,
  };
}

function updateQueuePositions(): void {
  const queued = sortedQueuedJobs();
  const total = queued.length;
  queued.forEach((job, idx) => {
    const next = queuedProgress(idx + 1, total);
    if (
      job.progress.stage !== 'queued' ||
      job.progress.queuePosition !== next.queuePosition ||
      job.progress.queueTotal !== next.queueTotal
    ) {
      job.progress = next;
      emit(job, job.progress);
    }
  });
}

function startJob(job: Job): void {
  if (!job.url || !job.quality || !job.mode || job.status !== 'running') return;
  if (inflightJobs.has(job.id)) return;
  inflightJobs.add(job.id);
  void runWithRetry(job, job.url, job.quality, job.mode).finally(() => {
    inflightJobs.delete(job.id);
    dispatchQueue();
  });
}

const inflightJobs = new Set<string>();

/** Fill idle worker slots from the wait queue (HD jobs jump ahead of 2K/4K). */
function dispatchQueue(): void {
  let started = true;
  while (started) {
    started = false;
    for (const job of sortedQueuedJobs()) {
      if (!job.quality || !job.url || !job.mode) continue;
      if (!canStartJob(job.quality)) continue;
      job.status = 'running';
      job.progress = {
        percent: 1,
        speed: null,
        eta: null,
        stage: 'downloading',
        streamIndex: 1,
        streamTotal: 1,
      };
      emit(job, job.progress);
      startJob(job);
      started = true;
      break;
    }
  }
  updateQueuePositions();
}

/** Respect the user's quality choice; optional cap for phone-optimized 2K/4K. */
function effectiveQuality(
  _url: string,
  quality: QualityDef,
  _fast?: boolean,
  galleryMaxHeight?: number,
): QualityDef {
  if (!galleryMaxHeight || quality.height <= galleryMaxHeight) return quality;
  for (const id of ['1080', '720'] as const) {
    const capped = getQuality(id);
    if (capped && capped.height <= galleryMaxHeight) {
      logger.info(`Mobile optimize: ${quality.label} source → ${capped.label} (faster phone download)`);
      return capped;
    }
  }
  return quality;
}

function emit(job: Job, payload: ProgressUpdate | { done: true; outputHeight?: number | null } | { error: string }) {
  for (const fn of job.listeners) fn(payload);
}

/** True when the gallery-ready file can be served (mobile Save to Photos flow). */
export function isGalleryReady(job: Job): boolean {
  if (!job.galleryPrep) return true;
  return Boolean(job.galleryPath);
}

/** Start H.264 transcode in the background — never block the download progress UI. */
export function warmGalleryNormalize(job: Job): void {
  if (!job.filePath || !job.galleryPrep) return;
  if (job.galleryNormalize || job.galleryPath) return;

  const input = job.filePath;
  job.galleryNormalizeFailed = false;
  job.galleryNormalize = normalizeForGallery(input, job.dir, galleryNormalizeOptions(job))
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
      return undefined;
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
  options?: {
    fast?: boolean;
    reuse?: boolean;
    clip?: ClipRange | null;
    ip?: string;
    galleryPrep?: boolean;
    galleryMaxHeight?: number;
  },
): Promise<Job> {
  const q = effectiveQuality(url, quality, options?.fast, options?.galleryMaxHeight);
  const clip = options?.clip ?? null;
  const cacheKey = jobCacheKey(url, q, mode, options?.fast, clip);

  // Each visitor may run several downloads at once (laptop + phone). Only retire
  // their oldest job when they exceed the per-IP cap — never block other users.
  if (options?.ip) {
    let mine = runningJobsByIp(options.ip);
    while (mine.length >= config.maxConcurrentJobsPerIp) {
      const oldest = [...mine].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!oldest) break;
      logger.info(
        `Per-IP limit (${config.maxConcurrentJobsPerIp}): superseding job ${oldest.id} for ${options.ip}`,
      );
      await destroyJob(oldest.id);
      mine = runningJobsByIp(options.ip);
    }
  }

  if (options?.reuse) {
    const existing = findReusableJob(url, q, mode, options.fast, clip);
    if (existing) {
      logger.info(`Reusing download job ${existing.id} (${existing.status})`);
      return existing;
    }
  }

  // Request coalescing (object store mode): while one visitor's download of
  // this exact video+settings is queued/running, later visitors attach to the
  // SAME job instead of starting another yt-dlp run — a viral link costs one
  // source download no matter how many people click at once. Safe only with
  // the store on: finished files live in R2, so the first client's pickup
  // doesn't delete the file out from under the others. Mobile gallery jobs
  // (galleryPrep) keep dedicated jobs — their output differs per device.
  if (objectStoreEnabled() && !options?.galleryPrep) {
    const id = jobsByKey.get(cacheKey);
    const existing = id ? jobs.get(id) : undefined;
    if (existing && existing.status !== 'error' && !existing.galleryPrep) {
      logger.info(`Coalescing into download job ${existing.id} (${existing.status})`);
      return existing;
    }
  }

  if (countQueuedJobs() >= config.maxQueueSize) {
    throw new YtDlpError(
      'Too many downloads are waiting right now. Please try again in a few minutes.',
      'FAILED',
    );
  }

  if (q.id !== quality.id) {
    logger.info(`Quality adjusted: ${quality.label} → ${q.label}`);
  }

  await fsp.mkdir(config.tmpRoot, { recursive: true });
  const id = nanoid();
  const dir = path.join(config.tmpRoot, id);
  await fsp.mkdir(dir, { recursive: true });

  const startNow = canStartJob(q);
  const job: Job = {
    id,
    dir,
    status: startNow ? 'running' : 'queued',
    progress: startNow ? { ...FRESH_PROGRESS } : queuedProgress(1, 1),
    createdAt: Date.now(),
    url: url.trim(),
    quality: q,
    mode,
    platformId: detectPlatform(url)?.id,
    fast: options?.fast ?? false,
    requestedHeight: quality.height,
    galleryPrep: options?.galleryPrep ?? false,
    galleryMaxHeight: options?.galleryMaxHeight,
    clip,
    ip: options?.ip,
    cacheKey,
    cancel: () => undefined, // replaced per attempt
    listeners: new Set(),
  };
  jobs.set(id, job);
  jobsByKey.set(cacheKey, id);

  if (startNow) {
    startJob(job);
  } else {
    logger.info(`Job ${id} queued (${countQueuedJobs()} waiting, ${countRunningJobs()} active workers)`);
    dispatchQueue();
  }
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
      job.progress = { percent: 2, speed: null, eta: null, stage: 'downloading', streamIndex: 1, streamTotal: 1 };
      emit(job, job.progress);
      const prepPulse = setInterval(() => {
        const j = jobs.get(job.id);
        if (!j || j.progress.percent > 5) return;
        j.progress = {
          ...j.progress,
          percent: Math.min(5, j.progress.percent + 0.5),
          stage: 'downloading',
        };
        emit(j, j.progress);
      }, 10_000);
      try {
        await ensureInfoJsonCache(url);
      } catch (err) {
        logger.warn('Info-json warm failed — download will extract inline:', (err as Error).message);
      } finally {
        clearInterval(prepPulse);
      }
    } else {
      logger.info('Download skipping info-json warm — cache hit');
    }

    const handle = startDownload(url, quality, mode, job.dir, (p) => {
      const j = jobs.get(job.id);
      if (!j) return;
      j.progress = p;
      emit(j, p);
    }, { fast: job.fast, clip: job.clip ?? undefined, galleryMaxHeight: job.galleryMaxHeight });
    job.cancel = handle.cancel;

    try {
      const filePath = await handle.done;
      job.status = 'ready';
      job.filePath = filePath;

      if (job.clip && !handle.sectionDownload) {
        job.progress = {
          percent: 93,
          speed: null,
          eta: null,
          stage: 'trimming',
          streamIndex: 1,
          streamTotal: 1,
        };
        emit(job, job.progress);
        try {
          const clipped = await trimVideo(filePath, job.dir, job.clip.startTime, job.clip.endTime);
          job.filePath = clipped;
          job.galleryPath = undefined;
          job.galleryNormalize = undefined;
          job.galleryNormalizeFailed = false;
        } catch (err) {
          job.status = 'error';
          job.errorMessage = (err as Error).message;
          emit(job, { error: job.errorMessage });
          scheduleDestroyJob(job.id);
          return;
        }
      }

      job.progress = { ...job.progress, percent: 100, speed: null, eta: null, stage: 'done' };

      const servePath = job.filePath!;

      if (job.galleryPrep) {
        if (await canServeDirectToGallery(servePath)) {
          job.galleryPath = servePath;
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
          if (job.galleryNormalize) await job.galleryNormalize;
          if (!job.galleryPath) {
            if (job.fast && needsGalleryNormalize(job.platformId)) {
              job.status = 'error';
              job.errorMessage =
                'Could not prepare this video for your gallery. Try again or pick 720p.';
              emit(job, { error: job.errorMessage });
              scheduleDestroyJob(job.id);
              return;
            }
            logger.warn('Gallery normalize failed, retrying once');
            job.galleryNormalize = undefined;
            job.galleryNormalizeFailed = false;
            warmGalleryNormalize(job);
            if (job.galleryNormalize) await job.galleryNormalize;
            if (!job.galleryPath) {
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
      const finalPath = job.galleryPath ?? job.filePath;
      if (finalPath) {
        job.outputHeight = await probeVideoHeight(finalPath);
        if (job.outputHeight) {
          logger.info(
            `Download ${job.id}: output ${job.outputHeight}p (requested ${quality.label}, source allows up to selected cap)`,
          );
        }
      }

      // === TRACK SUCCESSFUL DOWNLOAD ===
      if (job.platformId) {
        logDownload({
          platform: job.platformId,
          quality: quality.label,
          outputHeight: job.outputHeight ?? null,
          requestedHeight: quality.height,
          ip: job.ip,
        });
      }

      // Download-once cache: upload in the background (never delays this
      // user's pickup). Once stored, /api/file redirects to a presigned URL
      // and repeat requests for this video skip the pipeline entirely.
      if (finalPath && job.cacheKey && !job.galleryPrep && objectStoreEnabled()) {
        job.storeUpload = storeVideo(job.cacheKey, finalPath, {
          filename: path.basename(finalPath),
          height: job.outputHeight,
        })
          .then((key) => {
            if (key && jobs.has(job.id)) job.storedKey = key;
            return key;
          })
          .catch(() => null);
      }

      emit(job, { done: true, outputHeight: job.outputHeight ?? null });
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

/**
 * Called after a client finished receiving the file. Without the object store
 * this destroys the job immediately (original behavior — one download, one
 * serve). With the store on, wait for the background upload, free the temp
 * dir, and KEEP the job record: coalesced and late clients hitting
 * /api/file/:jobId get redirected to the stored copy until the sweeper runs.
 */
export async function finishServe(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  if (!objectStoreEnabled() || job.galleryPrep || !job.storeUpload) {
    await destroyJob(id);
    return;
  }
  await job.storeUpload.catch(() => null);
  if (!jobs.has(job.id)) return; // swept while uploading
  if (!job.storedKey) {
    await destroyJob(id);
    return;
  }
  await clearDir(job.dir);
  dispatchQueue();
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
  dispatchQueue();
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
