import { Router, type Request, type Response } from 'express';
import { getQuality } from '../services/formats.js';
import { consumeStreamDownloadToken } from '../services/streamDownloadToken.js';
import { startClientStreamDownload } from '../services/ytdlp.js';
import { logger } from '../utils/logger.js';

export const streamRouter = Router();

/**
 * GET /api/stream/:token
 * Pipe true HD (DASH merge) straight to the browser — no server file, no progress UI.
 */
streamRouter.get('/stream/:token', (req: Request, res: Response) => {
  const entry = consumeStreamDownloadToken(req.params.token);
  if (!entry) {
    return res.status(404).json({ error: 'That download link has expired. Please try again.' });
  }

  const quality = getQuality(entry.qualityId);
  if (!quality) {
    return res.status(400).json({ error: 'Invalid quality for this download.' });
  }

  let child: ReturnType<typeof startClientStreamDownload>;
  try {
    child = startClientStreamDownload(entry.url, quality, entry.mode, {
      galleryMaxHeight: entry.galleryMaxHeight,
    });
  } catch (err) {
    logger.warn('Stream download spawn failed:', (err as Error).message);
    return res.status(500).json({ error: 'Could not start the download.' });
  }

  let stderr = '';
  let started = false;

  const cleanup = () => {
    if (!child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
    }
  };

  req.on('close', () => {
    if (!res.writableEnded) cleanup();
  });

  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
  });

  child.on('error', (err) => {
    logger.warn('Stream download process error:', err.message);
    if (!started) {
      return res.status(500).json({ error: 'Could not start the download.' });
    }
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });

  child.stdout.on('data', (chunk: Buffer) => {
    if (!started) {
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-VidCliply-Height', String(entry.targetHeight));
    }
    if (!res.write(chunk)) {
      child.stdout.pause();
      res.once('drain', () => child.stdout.resume());
    }
  });

  child.on('close', (code) => {
    if (!started) {
      logger.warn('Stream download failed before bytes:', stderr.slice(0, 400));
      return res.status(502).json({ error: 'Could not fetch the video at the requested quality.' });
    }
    if (code === 0) res.end();
    else {
      logger.warn(`Stream download exited ${code}:`, stderr.slice(0, 400));
      if (!res.writableEnded) res.destroy();
    }
  });
});
