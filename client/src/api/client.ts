import type { ClipRange, CodecMode, ProgressUpdate, QualityId, VideoInfo } from '../types';
import { API_NOT_CONFIGURED_MSG, API_UNREACHABLE_MSG, apiUrl, isApiConfigured } from '../config/api';
import { downloadFileToDevice, isMobileDevice, isNativeMobileApp, saveMobileVideoToGallery } from '../utils/saveVideo';
import { detectPlatform } from '../utils/platform';
import { fetchClientYoutubePreview } from '../utils/youtube';
import { fetchClientInstagramPreview } from '../utils/instagram';
import { fetchClientFacebookPreview } from '../utils/facebook';
import { retryFetch } from '../utils/retryFetch';

/** Thrown for any non-2xx API response, carrying the friendly server message. */
export class ApiError extends Error {
  /** Extra fields from the JSON error body (e.g. `limitReached`, `upgrade`). */
  data?: Record<string, unknown>;
  constructor(message: string, data?: Record<string, unknown>) {
    super(message);
    this.data = data;
  }
}

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
  const data = (isJson ? await res.json().catch(() => ({})) : {}) as {
    error?: string;
  } & Record<string, unknown>;

  if (!res.ok) {
    if (data.error) throw new ApiError(data.error, data);
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

/** Kick off a download — job pipeline or SaveFrom-style direct CDN URL. */
export type DownloadStartResult =
  | { kind: 'job'; jobId: string }
  | { kind: 'direct'; url: string; filename: string; height?: number };

export async function startDownloadJob(
  url: string,
  quality: QualityId,
  mode: CodecMode,
  license?: string,
  options?: {
    fast?: boolean;
    reuse?: boolean;
    clip?: ClipRange | null;
    galleryPrep?: boolean;
    galleryMaxHeight?: number;
  },
): Promise<DownloadStartResult> {
  const data = await postJson<{
    jobId?: string;
    direct?: boolean;
    url?: string;
    filename?: string;
    height?: number;
  }>('/api/download', {
    url,
    quality,
    mode,
    license,
    fast: options?.fast ?? false,
    reuse: options?.reuse ?? false,
    galleryPrep: options?.galleryPrep ?? false,
    ...(options?.galleryMaxHeight != null ? { galleryMaxHeight: options.galleryMaxHeight } : {}),
    ...(options?.clip
      ? { startTime: options.clip.startTime, endTime: options.clip.endTime }
      : {}),
  });

  if (data.direct && data.url) {
    return {
      kind: 'direct',
      url: data.url,
      filename: data.filename ?? 'video.mp4',
      height: data.height,
    };
  }

  if (!data.jobId) {
    throw new ApiError('Could not start the download.');
  }

  return { kind: 'job', jobId: data.jobId };
}

/* ------------------------------- billing ------------------------------- */

export interface BillingConfig {
  enabled: boolean;
  publishableKey?: string | null;
  plans: {
    pro: { cents: number; label: string; interval: string | null; maxHeight: number };
  };
  freeMaxHeight: number;
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const res = await fetch(apiUrl('/api/billing/config'));
  if (!res.ok) throw new ApiError('Could not load pricing.');
  return res.json();
}

export interface HighResQuota {
  pro: boolean;
  limit: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
}

/** How many free 2K/4K downloads this IP has left (any URL). Lightweight GET — no cold-start retries. */
export async function fetchHighResQuota(license?: string | null, timeoutMs = 4000): Promise<HighResQuota> {
  const params = license ? `?license=${encodeURIComponent(license)}` : '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(`/api/download/quota${params}`), { signal: ctrl.signal });
    if (!res.ok) throw new ApiError('Could not load download quota.');
    return res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('Could not reach the server to check your download quota.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** True when this visitor has used all free 2K/4K downloads. */
export function isHighResQuotaExhausted(q: HighResQuota): boolean {
  return !q.unlimited && q.used >= q.limit;
}

export type CheckoutPlan = 'pro';

/** Starts Stripe Checkout for a plan; returns the redirect URL. */
export async function createCheckout(plan: CheckoutPlan): Promise<string> {
  const { url } = await postJson<{ url: string }>('/api/billing/checkout', { plan });
  return url;
}

export interface RedeemResult {
  token: string;
  email: string;
  plan: 'pro' | 'hd' | '2k' | '4k' | 'yearly' | 'monthly' | 'lifetime';
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
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let backupTimer: ReturnType<typeof setInterval> | undefined;
  let lastProgressAt = Date.now();

  const clearTimers = () => {
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (backupTimer) clearInterval(backupTimer);
    pollTimer = undefined;
    reconnectTimer = undefined;
    backupTimer = undefined;
  };

  const applyProgress = (p: ProgressUpdate) => {
    lastProgressAt = Date.now();
    handlers.onProgress(p);
  };

  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimers();
    fn();
    es.close();
  };

  /**
   * Resilient fallback when the SSE stream drops. Free-tier hosts (Render) and
   * flaky mobile networks routinely break the event stream mid-download even
   * though the job keeps running server-side. Rather than fail the whole
   * download on a transient blip, we poll the job status — recovering progress,
   * completion, AND errors at any percent (not just near the end). The server
   * keeps finished/failed jobs around for a grace period for exactly this.
   */
  const startPolling = () => {
    if (polling || settled) return;
    polling = true;
    es.close(); // stop EventSource's own reconnect loop; we own recovery now
    let attempts = 0;
    let networkErrors = 0;
    let lastProgress: ProgressUpdate | undefined;
    const tick = async () => {
      if (settled) return;
      attempts += 1;
      const merging = lastProgress?.stage === 'merging';
      const maxAttempts = merging ? 1800 : 180;
      const pollMs = merging ? 1000 : 2000;
      try {
        const res = await fetch(apiUrl(`/api/file/${jobId}/status`));
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          progress?: ProgressUpdate;
          galleryReady?: boolean;
          galleryFailed?: boolean;
          message?: string;
        };
        networkErrors = 0;
        if (res.status === 404) {
          settle(() => handlers.onError('That download session expired. Please try again.'));
          return;
        }
        if (res.status === 500 || data.status === 'error' || data.galleryFailed) {
          settle(() => handlers.onError(data.message ?? 'The download failed. Please try again.'));
          return;
        }
        if (res.ok && data.status === 'ready' && data.galleryReady !== false) {
          settle(() => handlers.onDone());
          return;
        }
        // Still running — keep the progress bar moving from the polled state.
        if (data.progress && typeof data.progress.percent === 'number') {
          lastProgress = data.progress;
          applyProgress(data.progress);
        }
      } catch {
        // Server briefly unreachable (e.g. waking up) — tolerate a run of these.
        networkErrors += 1;
        if (networkErrors >= 15) {
          settle(() => handlers.onError('Lost connection to the server. Please try again.'));
          return;
        }
      }
      if (attempts >= maxAttempts) {
        settle(() => handlers.onError('Lost connection to the server. Please try again.'));
        return;
      }
      pollTimer = setTimeout(() => void tick(), pollMs);
    };
    void tick();
  };

  // A live message (open or progress) means the stream recovered — cancel any
  // pending fallback so we stay on the real-time SSE path.
  const cancelReconnectWatch = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };
  es.addEventListener('open', cancelReconnectWatch);

  es.addEventListener('progress', (e) => {
    cancelReconnectWatch();
    try {
      const p = JSON.parse((e as MessageEvent).data) as ProgressUpdate;
      applyProgress(p);
    } catch {
      /* ignore malformed frame */
    }
  });

  // SSE can drop on desktop too (Railway proxies). Poll when the stream goes quiet.
  backupTimer = setInterval(() => {
    if (settled || polling) return;
    if (Date.now() - lastProgressAt < 4000) return;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/file/${jobId}/status`));
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          progress?: ProgressUpdate;
          galleryReady?: boolean;
          galleryFailed?: boolean;
          message?: string;
        };
        if (res.status === 404) {
          settle(() => handlers.onError('That download session expired. Please try again.'));
          return;
        }
        if (res.status === 500 || data.status === 'error' || data.galleryFailed) {
          settle(() => handlers.onError(data.message ?? 'The download failed. Please try again.'));
          return;
        }
        if (res.ok && data.status === 'ready' && data.galleryReady !== false) {
          settle(() => handlers.onDone());
          return;
        }
        if (data.progress && typeof data.progress.percent === 'number') {
          applyProgress(data.progress);
        }
      } catch {
        /* ignore transient poll errors */
      }
    })();
  }, 3000);

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
      // Server explicitly reported a job failure and gave us a message.
      try {
        settle(() => handlers.onError(JSON.parse(data).message ?? 'The download failed.'));
      } catch {
        settle(() => handlers.onError('The download failed.'));
      }
      return;
    }
    if (settled || polling) return;
    // Transport-level drop (no payload). If the browser has stopped
    // reconnecting, take over with polling now; if it's still retrying, give
    // it a short grace window before we do — instead of failing outright.
    if (es.readyState === EventSource.CLOSED) {
      startPolling();
      return;
    }
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => startPolling(), isMobileDevice() ? 3000 : 8000);
    }
  });

  return () => {
    settled = true;
    clearTimers();
    es.close();
  };
}

/**
 * Delivers the finished file. Desktop: direct download. Mobile: validated fetch + share.
 */
export async function triggerFileDownload(jobId: string): Promise<void> {
  if (isNativeMobileApp()) {
    await saveMobileVideoToGallery(jobId);
    return;
  }
  await downloadFileToDevice(jobId);
}

export { isMobileDevice };
