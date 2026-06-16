import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { startSweeper } from './jobManager.js';
import { infoRouter } from './routes/info.js';
import { downloadRouter } from './routes/download.js';
import { progressRouter } from './routes/progress.js';
import { fileRouter } from './routes/file.js';
import { billingRouter, handleWebhook } from './routes/billing.js';

const app = express();

app.use(cors({ origin: config.clientOrigin }));

// Stripe webhook needs the RAW body for signature verification, so it must be
// registered before the JSON body parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const result = handleWebhook(req.body as Buffer, String(sig ?? ''));
  res.status(result.ok ? 200 : 400).json({ received: result.ok });
});

app.use(express.json({ limit: '64kb' }));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Feature routes
app.use('/api', infoRouter);
app.use('/api', downloadRouter);
app.use('/api', progressRouter);
app.use('/api', fileRouter);
app.use('/api', billingRouter);

// 404 + error fallbacks (never leak stack traces to the client)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

startSweeper();

app.listen(config.port, () => {
  logger.info(`ClipVault API listening on http://localhost:${config.port}`);
  logger.info(`Using yt-dlp: ${config.ytdlpPath} | ffmpeg: ${config.ffmpegPath}`);
});
