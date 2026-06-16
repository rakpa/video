/**
 * API base URL for production. Leave empty in dev — Vite proxies /api to the backend.
 * On Vercel, set VITE_API_URL to your deployed server origin (no trailing slash).
 * Example: https://clipvault-api.up.railway.app
 */
const raw = import.meta.env.VITE_API_URL?.trim() ?? '';
export const API_BASE = raw.replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function isApiConfigured(): boolean {
  return Boolean(API_BASE) || import.meta.env.DEV;
}

export const API_NOT_CONFIGURED_MSG =
  'Download service is not connected. Deploy the ClipVault API server and set VITE_API_URL in Vercel to its URL.';

export const API_UNREACHABLE_MSG =
  'Could not reach the download service. Check that the API server is running and CLIENT_ORIGIN allows this site.';
