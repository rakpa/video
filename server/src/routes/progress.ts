import { Router } from 'express';
import { getJob, isGalleryReady } from '../jobManager.js';

export const progressRouter = Router();

/**
 * GET /api/progress/:jobId  (Server-Sent Events)
 * Streams { percent, speed, eta, stage } updates, then a final `done` or `error`.
 */
progressRouter.get('/progress/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'That download session has expired.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Immediately replay the latest known state so the client isn't blank.
  send('progress', job.progress);
  if (job.status === 'ready' && isGalleryReady(job)) send('done', { ready: true });
  if (job.status === 'error') send('error', { message: job.errorMessage });

  const listener = (payload: unknown) => {
    if (payload && typeof payload === 'object' && 'done' in payload) {
      send('done', { ready: true });
    } else if (payload && typeof payload === 'object' && 'error' in payload) {
      send('error', { message: (payload as { error: string }).error });
    } else {
      send('progress', payload);
    }
  };

  job.listeners.add(listener);

  // Heartbeat keeps proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.listeners.delete(listener);
  });
});
