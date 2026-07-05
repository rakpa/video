import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { getCookiesStatus, logCookiesStatus } from './utils/cookies.js';
import { startSweeper } from './jobManager.js';
import { infoRouter } from './routes/info.js';
import { downloadRouter } from './routes/download.js';
import { progressRouter } from './routes/progress.js';
import { fileRouter } from './routes/file.js';
import { thumbRouter } from './routes/thumb.js';
import { billingRouter, handleWebhook } from './routes/billing.js';
import statsRouter from './routes/stats.js';
import adminRouter from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();

// Normalise an origin to a scheme-less, lowercase host (no trailing slash) so a
// configured CLIENT_ORIGIN that omits "https://" (a very common mistake) still
// matches the real browser Origin header. The `cors` package otherwise does an
// exact string compare, which silently drops the Access-Control-Allow-Origin
// header and makes every browser request fail with "could not reach".
const normaliseOrigin = (o: string): string =>
  o.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();

const allowAllOrigins = config.clientOrigin.includes('*');
const allowedHosts = new Set(config.clientOrigin.map(normaliseOrigin));

const corsOrigin: cors.CorsOptions['origin'] = allowAllOrigins
  ? true
  : (origin, callback) => {
      // No Origin header → non-browser client (curl, server-to-server, health
      // checks) or same-origin navigation; allow it.
      if (!origin || allowedHosts.has(normaliseOrigin(origin))) {
        return callback(null, true);
      }
      return callback(null, false);
    };
app.use(cors({ origin: corsOrigin }));

// Capture the running yt-dlp version once at startup so /api/health can report
// it — the surest way to tell whether a deploy actually picked up a fresh binary.
let ytdlpVersion = 'unknown';
execFile(config.ytdlpPath, ['--version'], { windowsHide: true }, (err, stdout) => {
  if (!err) ytdlpVersion = stdout.trim();
  else logger.warn('Could not read yt-dlp version:', err.message);
});

/** Strip credentials from a proxy URL, leaving host:port for safe diagnostics. */
function maskProxy(proxy: string): string | null {
  if (!proxy) return null;
  try {
    const u = new URL(proxy);
    return `${u.protocol}//${u.host}`;
  } catch {
    return proxy.replace(/\/\/[^@]*@/, '//');
  }
}

// Stripe webhook needs the RAW body for signature verification, so it must be
// registered before the JSON body parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const result = handleWebhook(req.body as Buffer, String(sig ?? ''));
  res.status(result.ok ? 200 : 400).json({ received: result.ok });
});

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true }));

// Malformed JSON should be a 400, not an unhandled 500.
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in (err as object) && req.path.startsWith('/api')) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  next(err);
});

// Health check (includes cookies status for debugging — no secret values)
app.get('/api/health', (_req, res) => {
  const cookies = getCookiesStatus();
  res.json({
    ok: true,
    ytdlpVersion,
    cookies: {
      configured: Boolean(cookies.path),
      found: cookies.exists,
      lines: cookies.lines,
      hasGoogle: cookies.hasGoogle,
      hasYoutube: cookies.hasYoutube,
    },
    youtube: {
      poTokenConfigured: Boolean(config.ytdlpPoToken),
      playerClient: config.youtubePlayerClient,
    },
    // Proxy status for debugging datacenter-IP blocks. Host:port only — never
    // the username/password embedded in the URL.
    proxy: {
      configured: config.proxies.length > 0,
      count: config.proxies.length,
      hosts: config.proxies.map(maskProxy),
    },
  });
});

// Feature routes
app.use('/api', infoRouter);
app.use('/api', downloadRouter);
app.use('/api', progressRouter);
app.use('/api', fileRouter);
app.use('/api', thumbRouter);
app.use('/api', billingRouter);
app.use('/api/admin', statsRouter);
app.use('/admin', adminRouter);

// 404 + error fallbacks (never leak stack traces to the client)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const serveClient = process.env.SERVE_CLIENT === 'true' && existsSync(clientDist);
if (serveClient) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  logger.info(`Serving client from ${clientDist}`);
}

startSweeper();

app.listen(config.port, () => {
  logger.info(`VidCliply API listening on port ${config.port}`);
  logger.info(`Using yt-dlp: ${config.ytdlpPath} | ffmpeg: ${config.ffmpegPath}`);
  logger.info(`CORS origins: ${config.clientOrigin.join(', ')}`);
  logCookiesStatus();
  if (config.ytdlpPoToken) {
    logger.info(
      `yt-dlp PO token: configured (client=${config.youtubePlayerClient !== 'default' ? config.youtubePlayerClient : 'mweb'})`,
    );
  } else {
    logger.info('yt-dlp PO token: not configured');
  }
  if (config.proxies.length > 0) {
    logger.info(`yt-dlp proxy: ${config.proxies.length} in pool, using a sticky IP (rotates only on failure)`);
  } else {
    logger.info('yt-dlp proxy: none configured (direct connection)');
  }
  if (config.lowMemoryMode) {
    logger.info(`Low-memory mode ON — max ${config.maxConcurrentJobs} concurrent job(s), serialized ffmpeg`);
  }
});
