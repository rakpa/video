import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getJob, destroyJob } from '../jobManager.js';

export const fileRouter = Router();

/** Strip characters that are unsafe in a Content-Disposition filename. */
function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video.mp4';
}

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

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(job.filePath);
  } catch {
    await destroyJob(job.id);
    return res.status(410).json({ error: 'The file is no longer available.' });
  }

  const downloadName = safeName(path.basename(job.filePath));
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

  const stream = fs.createReadStream(job.filePath);
  stream.pipe(res);

  const cleanup = () => void destroyJob(job.id);
  stream.on('end', cleanup);
  stream.on('error', () => {
    res.destroy();
    cleanup();
  });
  // If the client aborts mid-download, still clean up.
  req.on('close', () => {
    if (!res.writableEnded) {
      stream.destroy();
      cleanup();
    }
  });
});
