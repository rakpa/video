import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { startDownload, YtDlpError, type ProgressUpdate } from './services/ytdlp.js';
import type { CodecMode, QualityDef } from './services/formats.js';
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
  /** SSE listeners subscribed to this job's progress. */
  listeners: Set<(p: ProgressUpdate | { done: true } | { error: string }) => void>;
}

const jobs = new Map<string, Job>();

function emit(job: Job, payload: ProgressUpdate | { done: true } | { error: string }) {
  for (const fn of job.listeners) fn(payload);
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
export async function createJob(url: string, quality: QualityDef, mode: CodecMode): Promise<Job> {
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
    cancel: () => undefined, // replaced per attempt
    listeners: new Set(),
  };
  jobs.set(id, job);

  void runWithRetry(job, url, quality, mode);
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
    const handle = startDownload(url, quality, mode, job.dir, (p) => {
      const j = jobs.get(job.id);
      if (!j) return;
      j.progress = p;
      emit(j, p);
    });
    job.cancel = handle.cancel;

    try {
      const filePath = await handle.done;
      job.status = 'ready';
      job.filePath = filePath;
      job.progress = { ...job.progress, percent: 100, speed: null, eta: null, stage: 'done' };
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
      void destroyJob(job.id);
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
  jobs.delete(id);
  try {
    job.cancel();
  } catch {
    /* already exited */
  }
  await fsp.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
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
