import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getJob, destroyJob, isGalleryReady, warmGalleryNormalize, type Job } from '../jobManager.js';
import { needsGalleryNormalize } from '../services/normalizeVideo.js';
import { logger } from '../utils/logger.js';

export const fileRouter = Router();

/** Strip characters that are unsafe in a Content-Disposition filename. */
function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video.mp4';
}

/**
 * Instagram/Facebook files are transcoded to H.264 before serving (not during SSE)
 * so the progress stream can close promptly at 100% without proxy timeouts.
 * Never serve the raw HEVC download — iOS only offers "Save Video" for H.264.
 */
async function resolveServePath(job: Job): Promise<string> {
  const raw = job.filePath!;
  if (!needsGalleryNormalize(job.platformId)) return raw;
  if (job.galleryPath) return job.galleryPath;

  if (!job.galleryNormalize) {
    warmGalleryNormalize(job);
  }
  if (!job.galleryNormalize) {
    throw new Error('Gallery transcode could not start.');
  }

  try {
    const normalized = await job.galleryNormalize;
    if (job.galleryPath) return job.galleryPath;
    return normalized;
  } catch (err) {
    job.galleryNormalize = undefined;
    job.galleryNormalizeFailed = true;
    logger.warn('Gallery normalize failed — refusing to serve HEVC original:', (err as Error).message);
    throw err;
  }
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
  return res.json({
    status: 'ready',
    progress: job.progress,
    galleryReady: isGalleryReady(job),
  });
});

/**
 * GET /api/file/:jobId
 * Streams the finished MP4 to the browser, then deletes the temp dir.
 * Nothing is stored permanently.
 */
fileRouter.get('/file/:jobId', async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'That download session has expired.' });
  if (job.status === 'error') return res.status(500).json({ error: job.errorMessage });
  if (job.status !== 'ready' || !job.filePath) {
    return res.status(409).json({ error: 'The file is not ready yet.' });
  }

  let servePath: string;
  try {
    servePath = await resolveServePath(job);
  } catch (err) {
    const msg = (err as Error).message;
    if (needsGalleryNormalize(job.platformId) && !job.galleryPath) {
      return res.status(503).json({
        error:
          'Still preparing your video for Photos — the file is being converted to a gallery-compatible format. Try Save to Gallery again in a moment.',
      });
    }
    return res.status(500).json({ error: msg || 'Could not prepare the video file.' });
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

  const cleanup = () => void destroyJob(job.id);
  stream.on('end', cleanup);
  stream.on('error', () => {
    res.destroy();
    cleanup();
  });
  req.on('close', () => {
    if (!res.writableEnded) {
      stream.destroy();
      cleanup();
    }
  });
});
