import type { CodecMode, ProgressUpdate, QualityId, VideoInfo } from '../types';
import { API_NOT_CONFIGURED_MSG, API_UNREACHABLE_MSG, apiUrl, isApiConfigured } from '../config/api';
import { classicFileDownload, isMobileDevice, saveMobileVideoToGallery } from '../utils/saveVideo';
import { detectPlatform } from '../utils/platform';
import { fetchClientYoutubePreview } from '../utils/youtube';
import { fetchClientInstagramPreview } from '../utils/instagram';
import { fetchClientFacebookPreview } from '../utils/facebook';
import { retryFetch } from '../utils/retryFetch';

/** Thrown for any non-2xx API response, carrying the friendly server message. */
export class ApiError extends Error {}

/** Enough attempts to survive Render free-tier cold starts (~50s wake). */
const COLD_START_RETRY = { retries: 8, delayMs: 5000, backoffFactor: 1.4 } as const;

/** Preview is lightweight — shorter backoff so thumbnails appear quickly. */
const PREVIEW_RETRY = { retries: 4, delayMs: 1500, backoffFactor: 1.4 } as const;

function apiFailureMessage(res: Response, isJson: boolean): string {
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return 'The download service is waking up (Render free tier). Wait ~1 minute and try again.';
  }
  if (!isJson) {
    return import.meta.env.PROD && !import.meta.env.VITE_API_URL
      ? API_NOT_CONFIGURED_MSG
      : API_UNREACHABLE_MSG;
  }
  return 'Something went wrong. Please try again.';
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (!isApiConfigured()) {
    throw new ApiError(API_NOT_CONFIGURED_MSG);
  }

  let res: Response;
  try {
    // Retry with backoff so a sleeping free-tier backend (Render) gets a chance
    // to wake up instead of immediately surfacing "could not reach" on cold start.
    res = await retryFetch(
      apiUrl(path),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      COLD_START_RETRY,
    );
  } catch {
    throw new ApiError(API_UNREACHABLE_MSG);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = (isJson ? await res.json().catch(() => ({})) : {}) as { error?: string };

  if (!res.ok) {
    if (data.error) throw new ApiError(data.error);
    throw new ApiError(apiFailureMessage(res, Boolean(isJson)));
  }

  if (!isJson) {
    throw new ApiError(apiFailureMessage(res, false));
  }

  return data as T;
}

/** Fetch metadata + quality options for a URL. */
export function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return postJson<VideoInfo>('/api/info', { url });
}

/** Fast preview (title + thumbnail). YouTube uses browser oEmbed; IG/FB use instant placeholders + API OG scrape. */
export async function fetchVideoPreview(url: string): Promise<VideoInfo | null> {
  const platformId = detectPlatform(url)?.id;

  if (platformId === 'youtube') {
    const local = await fetchClientYoutubePreview(url);
    if (local) return local;
  }

  const instant =
    platformId === 'instagram'
      ? fetchClientInstagramPreview(url)
      : platformId === 'facebook'
        ? fetchClientFacebookPreview(url)
        : null;

  if (!isApiConfigured()) return instant;

  let res: Response;
  try {
    res = await retryFetch(
      apiUrl('/api/info/preview'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      },
      PREVIEW_RETRY,
    );
  } catch {
    return instant ?? (platformId === 'youtube' ? fetchClientYoutubePreview(url) : null);
  }
  if (res.status === 204) {
    return instant ?? (platformId === 'youtube' ? fetchClientYoutubePreview(url) : null);
  }
  if (!res.ok) return instant;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!isJson) return instant;
  const api = (await res.json()) as VideoInfo;
  if (!instant) return api;
  return {
    ...instant,
    ...api,
    platform: api.platform ?? instant.platform,
    title: api.title || instant.title,
    author: api.author || instant.author,
    thumbnail: api.thumbnail ?? instant.thumbnail,
  };
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
  const res = await fetch(apiUrl('/api/billing/config'));
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
  const es = new EventSource(apiUrl(`/api/progress/${jobId}`));
  let settled = false;
  let lastPercent = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    if (pollTimer) clearTimeout(pollTimer);
    fn();
    es.close();
  };

  /** SSE can drop while ffmpeg prepares IG/FB files — poll until the job is ready. */
  const pollUntilReady = () => {
    let attempts = 0;
    const tick = async () => {
      if (settled) return;
      attempts += 1;
      try {
        const res = await fetch(apiUrl(`/api/file/${jobId}/status`));
        if (res.ok) {
          const data = (await res.json()) as { status?: string };
          if (data.status === 'ready') {
            settle(() => handlers.onDone());
            return;
          }
        }
      } catch {
        /* retry */
      }
      if (attempts >= 90) {
        settle(() => handlers.onError('Lost connection to the server.'));
        return;
      }
      pollTimer = setTimeout(() => void tick(), 2000);
    };
    void tick();
  };

  es.addEventListener('progress', (e) => {
    try {
      const p = JSON.parse((e as MessageEvent).data) as ProgressUpdate;
      lastPercent = p.percent;
      handlers.onProgress(p);
    } catch {
      /* ignore malformed frame */
    }
  });

  es.addEventListener('done', () => {
    settle(() => handlers.onDone());
  });

  es.addEventListener('error', (e) => {
    const data = (e as MessageEvent).data;
    if (data) {
      try {
        settle(() => handlers.onError(JSON.parse(data).message ?? 'The download failed.'));
      } catch {
        settle(() => handlers.onError('The download failed.'));
      }
      return;
    }
    // Near 100% the connection often drops during gallery prep — recover via poll.
    if (lastPercent >= 95) {
      es.close();
      pollUntilReady();
      return;
    }
    settle(() => handlers.onError('Lost connection to the server.'));
  });

  return () => {
    settled = true;
    if (pollTimer) clearTimeout(pollTimer);
    es.close();
  };
}

/**
 * Delivers the finished file. Desktop: direct download. Mobile: validated fetch + share.
 */
export async function triggerFileDownload(jobId: string): Promise<void> {
  if (!isMobileDevice()) {
    classicFileDownload(jobId);
    return;
  }
  await saveMobileVideoToGallery(jobId);
}

export { isMobileDevice };
