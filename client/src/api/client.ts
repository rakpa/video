import type { CodecMode, ProgressUpdate, QualityId, VideoInfo } from '../types';

/** Thrown for any non-2xx API response, carrying the friendly server message. */
export class ApiError extends Error {}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?');
  }

  // The Vite proxy returns a non-JSON HTML page when the backend is down, so
  // guard the parse and surface a clear, actionable message in that case.
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = (isJson ? await res.json().catch(() => ({})) : {}) as { error?: string };

  if (!res.ok) {
    if (data.error) throw new ApiError(data.error);
    if (res.status >= 500 && !isJson) {
      throw new ApiError('Can’t reach the download service. Make sure the backend is running (cd server && npm run dev).');
    }
    throw new ApiError('Something went wrong. Please try again.');
  }
  return data as T;
}

/** Fetch metadata + quality options for a URL. */
export function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return postJson<VideoInfo>('/api/info', { url });
}

/** Fast preview (title + thumbnail). YouTube only; returns null when unavailable. */
export async function fetchVideoPreview(url: string): Promise<VideoInfo | null> {
  let res: Response;
  try {
    res = await fetch('/api/info/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    return null;
  }
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json() as Promise<VideoInfo>;
}

/** Kick off a download job; returns the job id. `license` unlocks premium qualities. */
export async function startDownloadJob(
  url: string,
  quality: QualityId,
  mode: CodecMode,
  license?: string,
): Promise<string> {
  const { jobId } = await postJson<{ jobId: string }>('/api/download', { url, quality, mode, license });
  return jobId;
}

/* ------------------------------- billing ------------------------------- */

export interface BillingConfig {
  enabled: boolean;
  plans: {
    monthly: { cents: number; label: string; interval: string | null };
    lifetime: { cents: number; label: string; interval: string | null };
  };
  freeMaxHeight: number;
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const res = await fetch('/api/billing/config');
  if (!res.ok) throw new ApiError('Could not load pricing.');
  return res.json();
}

/** Starts Stripe Checkout for a plan; returns the redirect URL. */
export async function createCheckout(plan: 'monthly' | 'lifetime'): Promise<string> {
  const { url } = await postJson<{ url: string }>('/api/billing/checkout', { plan });
  return url;
}

export interface RedeemResult {
  token: string;
  email: string;
  plan: 'monthly' | 'lifetime';
  expiresAt: number | null;
}

/** Exchanges a completed Stripe session for a Pro license token. */
export function redeemSession(sessionId: string): Promise<RedeemResult> {
  return postJson<RedeemResult>('/api/billing/redeem', { session_id: sessionId });
}

export interface ProgressHandlers {
  onProgress: (p: ProgressUpdate) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Subscribes to a job's progress via Server-Sent Events.
 * Returns an unsubscribe function.
 */
export function subscribeProgress(jobId: string, handlers: ProgressHandlers): () => void {
  const es = new EventSource(`/api/progress/${jobId}`);

  es.addEventListener('progress', (e) => {
    try {
      handlers.onProgress(JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore malformed frame */
    }
  });

  es.addEventListener('done', () => {
    handlers.onDone();
    es.close();
  });

  es.addEventListener('error', (e) => {
    // Distinguish an application error frame from a transport drop.
    const data = (e as MessageEvent).data;
    if (data) {
      try {
        handlers.onError(JSON.parse(data).message ?? 'The download failed.');
      } catch {
        handlers.onError('The download failed.');
      }
    } else {
      handlers.onError('Lost connection to the server.');
    }
    es.close();
  });

  return () => es.close();
}

/**
 * Triggers the browser to download the finished file. We navigate via a hidden
 * anchor so the server's Content-Disposition controls the filename.
 */
export function triggerFileDownload(jobId: string): void {
  const a = document.createElement('a');
  a.href = `/api/file/${jobId}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
