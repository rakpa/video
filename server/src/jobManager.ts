import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { startDownload, type ProgressUpdate } from './services/ytdlp.js';
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

/** Creates a temp dir, spawns the download, and tracks it as a job. */
export async function createJob(url: string, quality: QualityDef, mode: CodecMode): Promise<Job> {
  await fsp.mkdir(config.tmpRoot, { recursive: true });
  const id = nanoid();
  const dir = path.join(config.tmpRoot, id);
  await fsp.mkdir(dir, { recursive: true });

  const initialProgress: ProgressUpdate = {
    percent: 0,
    speed: null,
    eta: null,
    stage: 'downloading',
    streamIndex: 1,
    streamTotal: 1,
  };

  const handle = startDownload(url, quality, mode, dir, (p) => {
    const j = jobs.get(id);
    if (!j) return;
    j.progress = p;
    emit(j, p);
  });

  const job: Job = {
    id,
    dir,
    status: 'running',
    progress: initialProgress,
    createdAt: Date.now(),
    cancel: handle.cancel,
    listeners: new Set(),
  };
  jobs.set(id, job);

  handle.done
    .then((filePath) => {
      job.status = 'ready';
      job.filePath = filePath;
      job.progress = { ...job.progress, percent: 100, speed: null, eta: null, stage: 'done' };
      emit(job, { done: true });
    })
    .catch((err: Error) => {
      job.status = 'error';
      job.errorMessage = err.message;
      emit(job, { error: err.message });
      void destroyJob(id);
    });

  return job;
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
