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

/** Wake the API (Render free tier cold start) before heavier yt-dlp work. */
export function pingApiWarmup(): void {
  if (!isApiConfigured()) return;
  void fetch(apiUrl('/api/health')).catch(() => undefined);
}

/** Fire-and-forget preview scrape so the thumbnail is ready when the UI asks. */
export function warmSocialPreview(url: string): void {
  if (!isApiConfigured()) return;
  void fetch(apiUrl('/api/info/preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => undefined);
}

async function fetchPreviewFromApi(url: string): Promise<VideoInfo | null> {
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
    return null;
  }
  if (res.status === 204) return null;
  if (!res.ok) return null;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!isJson) return null;
  return (await res.json()) as VideoInfo;
}

function mergeSocialPreview(client: VideoInfo | null, api: VideoInfo | null): VideoInfo | null {
  if (!client && !api) return null;
  if (!api) return client;
  if (!client) return api;
  return {
    ...client,
    ...api,
    platform: api.platform ?? client.platform,
    title: api.title && api.title !== 'Instagram Reel' && api.title !== 'Facebook video' ? api.title : client.title,
    author: api.author || client.author,
    thumbnail: api.thumbnail ?? client.thumbnail,
    durationSeconds: api.durationSeconds ?? client.durationSeconds,
  };
}

/** Fetch metadata + quality options for a URL. */
export function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return postJson<VideoInfo>('/api/info', { url });
}

/** Fast preview (title + thumbnail). YouTube uses browser oEmbed; IG/FB race client + API in parallel. */
export async function fetchVideoPreview(url: string): Promise<VideoInfo | null> {
  const platformId = detectPlatform(url)?.id;

  if (platformId === 'youtube') {
    return fetchClientYoutubePreview(url);
  }

  const clientPromise =
    platformId === 'instagram'
      ? fetchClientInstagramPreview(url)
      : platformId === 'facebook'
        ? Promise.resolve(fetchClientFacebookPreview(url))
        : Promise.resolve(null);

  if (!isApiConfigured()) return clientPromise;

  const [client, api] = await Promise.all([clientPromise, fetchPreviewFromApi(url)]);
  return mergeSocialPreview(client, api);
}

/** Kick off a download job; returns the job id. `license` unlocks premium qualities. */
export async function startDownloadJob(
  url: string,
  quality: QualityId,
  mode: CodecMode,
  license?: string,
  options?: { fast?: boolean; reuse?: boolean },
): Promise<string> {
  const { jobId } = await postJson<{ jobId: string }>('/api/download', {
    url,
    quality,
    mode,
    license,
    fast: options?.fast ?? false,
    reuse: options?.reuse ?? false,
  });
  return jobId;
}

/* ------------------------------- billing ------------------------------- */

export interface BillingConfig {
  enabled: boolean;
  publishableKey?: string | null;
  plans: {
    yearly: { cents: number; label: string; interval: string | null };
  };
  freeMaxHeight: number;
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const res = await fetch(apiUrl('/api/billing/config'));
  if (!res.ok) throw new ApiError('Could not load pricing.');
  return res.json();
}

/** Starts Stripe Checkout for a plan; returns the redirect URL. */
export async function createCheckout(plan: 'yearly' = 'yearly'): Promise<string> {
  const { url } = await postJson<{ url: string }>('/api/billing/checkout', { plan });
  return url;
}

export interface RedeemResult {
  token: string;
  email: string;
  plan: 'yearly' | 'monthly' | 'lifetime';
  expiresAt: number | null;
}

/** Exchanges a completed Stripe session for a Pro license token. */
export function redeemSession(sessionId: string): Promise<RedeemResult> {
  return postJson<RedeemResult>('/api/billing/redeem', { session_id: sessionId });
}

/** Re-issues a Pro license for a returning customer by checkout email. */
export function restoreProAccess(email: string): Promise<RedeemResult> {
  return postJson<RedeemResult>('/api/billing/restore', { email });
}

export interface ProgressHandlers {
  onProgress: (p: ProgressUpdate) => void;
  onDone: (outputHeight?: number | null) => void;
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

  /** SSE can drop while ffmpeg prepares IG/FB files — poll until gallery-ready. */
  const pollUntilReady = () => {
    let attempts = 0;
    const tick = async () => {
      if (settled) return;
      attempts += 1;
      try {
        const res = await fetch(apiUrl(`/api/file/${jobId}/status`));
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          galleryReady?: boolean;
          galleryFailed?: boolean;
          message?: string;
        };
        if (res.status === 500 || data.galleryFailed) {
          settle(() =>
            handlers.onError(data.message ?? 'Could not prepare this video for your gallery.'),
          );
          return;
        }
        if (res.ok && data.status === 'ready' && data.galleryReady !== false) {
          settle(() => handlers.onDone());
          return;
        }
      } catch {
        /* retry */
      }
      if (attempts >= 120) {
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

  es.addEventListener('done', (e) => {
    let outputHeight: number | null | undefined;
    try {
      const raw = (e as MessageEvent).data;
      if (raw) {
        const parsed = JSON.parse(raw) as { outputHeight?: number | null };
        if (typeof parsed.outputHeight === 'number') outputHeight = parsed.outputHeight;
        else if (parsed.outputHeight === null) outputHeight = null;
      }
    } catch {
      /* ignore malformed frame */
    }
    settle(() => handlers.onDone(outputHeight));
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
