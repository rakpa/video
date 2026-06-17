import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

/**
 * Centralised, typed configuration sourced from environment variables.
 * Every value has a sensible default so the app runs with zero config.
 */
export const config = {
  port: Number(process.env.PORT ?? 3081),
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  ytdlpPath: process.env.YTDLP_PATH ?? 'yt-dlp',
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',

  // --- yt-dlp hardening for cloud hosts (YouTube bot-detection) ---
  // Path to a Netscape-format cookies.txt so yt-dlp can authenticate. This is
  // the most reliable fix for "Sign in to confirm you're not a bot" errors that
  // hit datacenter IPs (Render/AWS/GCP). Empty = no cookies (works locally).
  ytdlpCookies: (process.env.YTDLP_COOKIES ?? '').trim(),
  // YouTube player client(s) yt-dlp uses. 'default' lets yt-dlp pick its tuned,
  // up-to-date set; override e.g. 'web_safari,tv' if a specific client is blocked.
  youtubePlayerClient: (process.env.YTDLP_PLAYER_CLIENT ?? 'default').trim(),

  // Root directory where per-job temp folders are created.
  tmpRoot: path.join(os.tmpdir(), 'clipvault'),

  tmpTtlMs: Number(process.env.TMP_TTL_MINUTES ?? 30) * 60 * 1000,
  maxDurationSeconds: Number(process.env.MAX_DURATION_MINUTES ?? 180) * 60,

  // --- Monetisation ---
  // Resolutions at or below this height are free; above requires a Pro license.
  // 1080 → 720p & 1080p free; 2K (1440p) & 4K (2160p) are Pro.
  freeMaxHeight: Number(process.env.FREE_MAX_HEIGHT ?? 1080),

  // Stripe. Leave keys empty to run without billing (pricing page shows a notice).
  stripeSecret: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  priceMonthlyCents: Number(process.env.PRICE_MONTHLY_CENTS ?? 599),
  priceLifetimeCents: Number(process.env.PRICE_LIFETIME_CENTS ?? 900),

  // Secret used to HMAC-sign stateless Pro license tokens. CHANGE IN PRODUCTION.
  licenseSecret: process.env.LICENSE_SECRET ?? 'dev-insecure-license-secret-change-me',
} as const;
