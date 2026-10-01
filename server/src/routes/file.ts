import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getJob, destroyJob, isGalleryReady, warmGalleryNormalize, type Job } from '../jobManager.js';
import { presignedDownloadUrl, resolveCachedArtifact, streamR2Object } from '../services/r2Storage.js';
import { logger } from '../utils/logger.js';

export const fileRouter = Router();

/** Strip characters that are unsafe in a Content-Disposition filename. */
function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video.mp4';
}

function jobIsDeliverable(job: Job): boolean {
  return Boolean(job.r2Key || job.filePath);
}

/**
 * Path to stream for gallery save. IG/FB only — returns null while H.264 prep runs.
 * Never serves raw HEVC: iOS Photos silently rejects "Save Video" for those files.
 */
function resolveServePath(job: Job): string | null {
  if (job.r2Key) return null;
  const raw = job.filePath!;
  if (!job.galleryPrep) return raw;
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
  if (job.status === 'queued') {
    return res.status(409).json({ status: 'queued', progress: job.progress });
  }
  if (job.status !== 'ready' || !jobIsDeliverable(job)) {
    return res.status(409).json({ status: 'running', progress: job.progress });
  }

  if (job.galleryPrep && !job.galleryPath && !job.galleryNormalize && !job.r2Key) {
    warmGalleryNormalize(job);
  }

  return res.json({
    status: 'ready',
    progress: job.progress,
    galleryReady: isGalleryReady(job),
    galleryFailed: Boolean(job.galleryNormalizeFailed && !job.galleryPath && !job.r2Key),
    cached: Boolean(job.fromCache || job.r2Key),
  });
});

/**
 * GET /api/file/:jobId
 * Redirects to R2 presigned URL when cached (desktop), else streams from local disk or R2 proxy.
 */
fileRouter.get('/file/:jobId', async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'That download session has expired.' });
  if (job.status === 'error') return res.status(500).json({ error: job.errorMessage });
  if (job.status !== 'ready' || !jobIsDeliverable(job)) {
    return res.status(409).json({ error: 'The file is not ready yet.' });
  }

  if (job.r2Key) {
    try {
      const artifact = job.cacheKey
        ? (await resolveCachedArtifact(job.cacheKey)) ?? { r2Key: job.r2Key, filename: 'video.mp4' }
        : null;

      const filename = safeName(artifact?.filename ?? 'video.mp4');
      const r2Key = artifact?.r2Key ?? job.r2Key;

      // Mobile gallery save fetches the file into a blob for Web Share — R2 redirects
      // fail cross-origin (no CORS), so proxy the bytes through our API instead.
      // ?proxy=1 — native app fetch: R2 sends no CORS headers, so relay the bytes.
      if (job.galleryPrep || req.query.proxy === '1') {
        await streamR2Object(r2Key, res, filename);
        setTimeout(() => void destroyJob(job.id), 120_000).unref();
        return;
      }

      const url = await presignedDownloadUrl(r2Key, filename);
      res.redirect(302, url);
      setTimeout(() => void destroyJob(job.id), 120_000).unref();
      return;
    } catch (err) {
      logger.warn('R2 delivery failed:', (err as Error).message);
      return res.status(500).json({ error: 'Could not prepare your download link.' });
    }
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
