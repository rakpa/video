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
  'Download service is not connected. The API server must be deployed and VITE_API_URL set in Vercel (see railway.toml in the repo).';

export const API_UNREACHABLE_MSG =
  'Could not reach the download service. If you just deployed, wait a minute for the API to wake up (free tier) and try again.';
