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
 * Parse the YTDLP_PROXY env into a normalised proxy-URL pool. Entries may be
 * separated by commas, spaces or newlines, and each may be a full URL
 * (http://user:pass@host:port, socks5://…) OR Webshare's raw export format
 * `host:port:user:pass`. Invalid entries are dropped. Requests rotate across
 * the pool so one blocked/slow IP doesn't stop downloads.
 */
function parseProxies(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeProxy)
    .filter((s): s is string => s !== null);
}

function normalizeProxy(entry: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(entry)) return entry; // already a URL
  const parts = entry.split(':');
  if (parts.length === 4) {
    const [host, port, user, pass] = parts; // Webshare raw: host:port:user:pass
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  if (parts.length === 2) return `http://${entry}`; // host:port, no auth
  return null;
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
  // Proxy pool for yt-dlp — the most reliable fix for datacenter-IP blocks.
  // One or many proxies via YTDLP_PROXY (comma/space/newline-separated), each a
  // full URL or Webshare raw `host:port:user:pass`. Requests rotate across them.
  proxies: parseProxies(process.env.YTDLP_PROXY),
  // YouTube PO Token for yt-dlp (e.g. mweb.gvs.TOKEN). See yt-dlp PO Token Guide.
  // Tokens may expire and can be per-video; a PO Token Provider plugin is better long-term.
  // Sanitised: a malformed value (e.g. JSON pasted by mistake) is dropped so it
  // can't pin yt-dlp to a single failing client and break extraction.
  ytdlpPoToken: cleanPoToken(process.env.YTDLP_PO_TOKEN),
  // YouTube player client(s) yt-dlp uses. 'default' lets yt-dlp pick its tuned,
  // up-to-date set; use 'mweb' when YTDLP_PO_TOKEN is set. Override e.g. 'web_safari'.
  youtubePlayerClient: (process.env.YTDLP_PLAYER_CLIENT ?? 'default').trim(),
  // Override the BgUtils PO-token provider URL. Empty = use the in-container
  // provider on its default port (127.0.0.1:4416); set this to point elsewhere.
  ytdlpPotBaseUrl: (process.env.YTDLP_POT_BASE_URL ?? '').trim(),

  // Root directory where per-job temp folders are created.
  tmpRoot: path.join(os.tmpdir(), 'clipvault'),

  tmpTtlMs: Number(process.env.TMP_TTL_MINUTES ?? 30) * 60 * 1000,
  maxDurationSeconds: Number(process.env.MAX_DURATION_MINUTES ?? 180) * 60,

  // --- Monetisation ---
  // Resolutions at or below this height are free; above requires a Pro license.
  // 2160 → everything (incl. 2K & 4K) is free for testing.
  // (Override with FREE_MAX_HEIGHT, e.g. 1080, to gate higher resolutions again.)
  freeMaxHeight: Number(process.env.FREE_MAX_HEIGHT ?? 2160),

  // Stripe. Leave keys empty to run without billing (pricing page shows a notice).
  stripeSecret: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  priceMonthlyCents: Number(process.env.PRICE_MONTHLY_CENTS ?? 599),
  priceLifetimeCents: Number(process.env.PRICE_LIFETIME_CENTS ?? 900),

  // Secret used to HMAC-sign stateless Pro license tokens. CHANGE IN PRODUCTION.
  licenseSecret: process.env.LICENSE_SECRET ?? 'dev-insecure-license-secret-change-me',
} as const;

// Start on a random proxy so restarts spread load across the pool, then stay put.
let proxyCursor = config.proxies.length > 0 ? Math.floor(Math.random() * config.proxies.length) : 0;

/**
 * The proxy currently in use. Deliberately **sticky**: one account's cookies
 * arriving from a single stable IP looks like a real signed-in user, whereas
 * hopping IPs on every request trips YouTube's "confirm you're not a bot" check.
 * Undefined when no proxy is configured.
 */
export function currentProxy(): string | undefined {
  const { proxies } = config;
  return proxies.length ? proxies[proxyCursor % proxies.length] : undefined;
}

/**
 * Advance to the next proxy in the pool. Call this only AFTER a request fails,
 * so a bad/blocked IP gets retired without hopping mid-session.
 */
export function rotateProxy(): string | undefined {
  if (config.proxies.length > 1) proxyCursor = (proxyCursor + 1) % config.proxies.length;
  return currentProxy();
}
