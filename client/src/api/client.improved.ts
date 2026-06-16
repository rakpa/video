import type { CodecMode, ProgressUpdate, QualityId, VideoInfo } from '../types';
import { API_NOT_CONFIGURED_MSG, API_UNREACHABLE_MSG, apiUrl } from '../config/api';
import { retryFetch } from '../utils/retryFetch';

/** Thrown for any non-2xx API response, carrying the friendly server message. */
export class ApiError extends Error {}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await retryFetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, {
      retries: 4,
      delayMs: 2000,
      backoffFactor: 1.7,
      onRetry: (attempt, error) => {
        console.log(`[API] Retry attempt ${attempt} for ${path}...`, error.message);
      },
    });
  } catch (err) {
    throw new ApiError(
      import.meta.env.PROD
        ? API_UNREACHABLE_MSG
        : 'Can’t reach the download service. Run the backend (cd server && npm run dev).'
    );
  }

  if (!res.ok) {
    let errorMessage = 'Something went wrong.';
    try {
      const data = await res.json();
      if (data.error) errorMessage = data.error;
    } catch {}
    throw new ApiError(errorMessage);
  }

  return res.json();
}

export function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return postJson<VideoInfo>('/api/info', { url });
}

/** Fast preview (title + thumbnail). YouTube only; returns null when unavailable. */
export async function fetchVideoPreview(url: string): Promise<VideoInfo | null> {
  try {
    return await postJson<VideoInfo>('/api/info/preview', { url });
  } catch {
    return null;
  }
}

export interface BillingConfig {
  plans: Array<{
    id: string;
    name: string;
    price: number;
    features: string[];
  }>;
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const res = await retryFetch(apiUrl('/api/billing/config'), {}, { retries: 2 });
  if (!res.ok) throw new ApiError('Could not load pricing.');
  return res.json();
}
