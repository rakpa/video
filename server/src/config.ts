import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

/**
 * A real yt-dlp PO token is a single opaque value (optionally CLIENT.CONTEXT+TOKEN)
 * — base64-ish, no whitespace, braces, quotes or colons. Reject anything else so a
 * malformed env value (e.g. a pasted JSON snippet) is treated as "no token".
 */
function cleanPoToken(raw: string | undefined): string {
  const t = (raw ?? '').trim();
  if (!t || /[\s{}":]/.test(t)) return '';
  return t;
}

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
  // Optional proxy for yt-dlp (e.g. http://user:pass@host:port). The most
  // reliable fix for datacenter IP blocks: route requests through a trusted
  // (residential/clean) IP. Empty = direct connection (fine locally).
  ytdlpProxy: (process.env.YTDLP_PROXY ?? '').trim(),
  // YouTube PO Token for yt-dlp (e.g. mweb.gvs.TOKEN). See yt-dlp PO Token Guide.
  // Tokens may expire and can be per-video; a PO Token Provider plugin is better long-term.
  // Sanitised: a malformed value (e.g. JSON pasted by mistake) is dropped so it
  // can't pin yt-dlp to a single failing client and break extraction.
  ytdlpPoToken: cleanPoToken(process.env.YTDLP_PO_TOKEN),
  // YouTube player client(s) yt-dlp uses. 'default' lets yt-dlp pick its tuned,
  // up-to-date set; use 'mweb' when YTDLP_PO_TOKEN is set. Override e.g. 'web_safari'.
  youtubePlayerClient: (process.env.YTDLP_PLAYER_CLIENT ?? 'default').trim(),

  // Root directory where per-job temp folders are created.
  tmpRoot: path.join(os.tmpdir(), 'clipvault'),

  tmpTtlMs: Number(process.env.TMP_TTL_MINUTES ?? 30) * 60 * 1000,
  maxDurationSeconds: Number(process.env.MAX_DURATION_MINUTES ?? 180) * 60,

  // --- Monetisation ---
  // Resolutions at or below this height are free; above requires a Pro license.
  // 1440 → 720p, 1080p & 2K (1440p) free; only 4K (2160p) is Pro.
  // (Override with FREE_MAX_HEIGHT, e.g. 1080 to make 1440p Pro again.)
  freeMaxHeight: Number(process.env.FREE_MAX_HEIGHT ?? 1440),

  // Stripe. Leave keys empty to run without billing (pricing page shows a notice).
  stripeSecret: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  priceMonthlyCents: Number(process.env.PRICE_MONTHLY_CENTS ?? 599),
  priceLifetimeCents: Number(process.env.PRICE_LIFETIME_CENTS ?? 900),

  // Secret used to HMAC-sign stateless Pro license tokens. CHANGE IN PRODUCTION.
  licenseSecret: process.env.LICENSE_SECRET ?? 'dev-insecure-license-secret-change-me',
} as const;
