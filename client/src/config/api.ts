/**
 * API base URL for production split deploy (Vercel UI + external API).
 * Leave empty to use same-origin relative /api paths (local dev proxy or unified deploy).
 */
const raw = import.meta.env.VITE_API_URL?.trim() ?? '';
export const API_BASE = raw.replace(/\/$/, '');

export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

/** True when the client can reach an API (dev proxy or production VITE_API_URL). */
export function isApiConfigured(): boolean {
  return Boolean(API_BASE) || import.meta.env.DEV;
}

export const API_NOT_CONFIGURED_MSG =
  'Download is not available right now — the video service is not connected. Please try again in a moment.';

export const API_UNREACHABLE_MSG =
  'Could not reach the download service. If you just opened the site, wait about a minute for it to wake up, then try again.';
