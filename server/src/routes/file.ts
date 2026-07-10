import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getJob, destroyJob, isGalleryReady, warmGalleryNormalize, type Job } from '../jobManager.js';
import { needsGalleryNormalizeForJob } from '../services/normalizeVideo.js';
import { logger } from '../utils/logger.js';

export const fileRouter = Router();

/** Strip characters that are unsafe in a Content-Disposition filename. */
function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video.mp4';
}

/**
 * Path to stream for gallery save. IG/FB only — returns null while H.264 prep runs.
 * Never serves raw HEVC: iOS Photos silently rejects "Save Video" for those files.
 */
function resolveServePath(job: Job): string | null {
  const raw = job.filePath!;
  if (!needsGalleryNormalizeForJob(job.platformId, job.fast, job.requestedHeight)) return raw;
  if (job.galleryPath) return job.galleryPath;

  if (!job.galleryNormalize && !job.galleryNormalizeFailed) {
    warmGalleryNormalize(job);
  }
  return null;
}

/**
 * GET /api/file/:jobId/status
 * Lightweight poll target when SSE drops near completion.
 */
fileRouter.get('/file/:jobId/status', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'That download session has expired.' });
  if (job.status === 'error') return res.status(500).json({ status: 'error', message: job.errorMessage });
  if (job.status !== 'ready' || !job.filePath) {
    return res.status(409).json({ status: 'running', progress: job.progress });
  }

  if (
    needsGalleryNormalizeForJob(job.platformId, job.fast, job.requestedHeight) &&
    !job.galleryPath &&
    !job.galleryNormalize
  ) {
    warmGalleryNormalize(job);
  }

  return res.json({
    status: 'ready',
    progress: job.progress,
    galleryReady: isGalleryReady(job),
    galleryFailed: Boolean(job.galleryNormalizeFailed && !job.galleryPath),
  });
});

/**
 * GET /api/file/:jobId
 * Streams the finished MP4 to the browser, then deletes the temp dir.
 * Returns 503 while IG/FB gallery prep runs — client polls /status instead of
 * holding a long connection (mobile browsers timeout and used to delete the job).
 */
fileRouter.get('/file/:jobId', async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'That download session has expired.' });
  if (job.status === 'error') return res.status(500).json({ error: job.errorMessage });
  if (job.status !== 'ready' || !job.filePath) {
    return res.status(409).json({ error: 'The file is not ready yet.' });
  }

  const servePath = resolveServePath(job);
  if (!servePath) {
    if (job.galleryNormalizeFailed) {
      return res.status(500).json({
        error: 'Could not prepare this video for your gallery. Try again or pick 720p.',
      });
    }
    return res.status(503).json({ error: 'Preparing video for your gallery…', preparing: true });
  }

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(servePath);
  } catch {
    await destroyJob(job.id);
    return res.status(410).json({ error: 'The file is no longer available.' });
  }

  const downloadName = safeName(path.basename(servePath));
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  const stream = fs.createReadStream(servePath);
  stream.pipe(res);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void destroyJob(job.id);
  };

  stream.on('end', cleanup);
  stream.on('error', () => {
    logger.warn('File stream error:', job.id);
    if (!res.writableEnded) res.destroy();
    cleanup();
  });
  req.on('close', () => {
    if (!res.writableEnded && !res.headersSent) {
      stream.destroy();
    }
  });
});
