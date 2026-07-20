import { API_BASE, API_NOT_CONFIGURED_MSG, apiUrl, isApiConfigured } from '../config/api';

/** True on the installed Capacitor app — not mobile Safari/Chrome. */
export function isNativeMobileApp(): boolean {
  return false;
}

/** Shown when the browser received HTML (often saved as index.html) instead of MP4. */
export const HTML_INSTEAD_OF_VIDEO_MSG =
  'Something went wrong — your browser received a webpage (sometimes saved as index.html) instead of the video. Please try downloading again. If this keeps happening, wait a minute for the service to wake up, then retry.';

/** Invalid / non-video payload from the file API. */
export const INVALID_VIDEO_FILE_MSG =
  'We could not save the video file. Please try again. If your browser keeps downloading a file named index.html, refresh the page and retry.';


/** Phones/tablets — coarse pointer or common mobile UA. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return mobileUa || (coarse && navigator.maxTouchPoints > 0);
}

function parseFilename(header: string | null): string {
  if (!header) return 'video.mp4';
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^\s;]+)/i.exec(header);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) return 'video.mp4';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isMp4Bytes(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const v = new DataView(buf);
  return v.getUint8(4) === 0x66 && v.getUint8(5) === 0x74 && v.getUint8(6) === 0x79 && v.getUint8(7) === 0x70;
}

function isH264Mp4(buf: ArrayBuffer): boolean {
  const head = new TextDecoder('latin1').decode(buf.slice(0, Math.min(buf.byteLength, 512 * 1024)));
  const hasAvc = head.includes('avc1') || head.includes('avc3');
  const hasHevc = head.includes('hvc1') || head.includes('hev1') || head.includes('hvt1');
  return hasAvc && !hasHevc;
}

function looksLikeHtmlOrJson(buf: ArrayBuffer): boolean {
  const head = new TextDecoder().decode(buf.slice(0, Math.min(256, buf.byteLength))).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{');
}

export interface VideoFilePayload {
  blob: Blob;
  filename: string;
  /**
   * True when the browser download manager owns the transfer (large desktop
   * files). In-app percent is only a handoff signal — watch the Downloads bar.
   */
  browserManaged?: boolean;
}

export type ShareResult = 'shared' | 'cancelled' | 'unavailable';

let mobileGestureTouchHandler: ((e: Event) => void) | null = null;

/** Remove any pending one-shot touch handler for mobile gallery save. */
export function cancelMobileGalleryGestureFallback(): void {
  if (!mobileGestureTouchHandler) return;
  document.removeEventListener('touchstart', mobileGestureTouchHandler, true);
  document.removeEventListener('click', mobileGestureTouchHandler, true);
  mobileGestureTouchHandler = null;
}

function toShareFile(payload: VideoFilePayload): File {
  const blob =
    payload.blob.type === 'video/mp4'
      ? payload.blob
      : new Blob([payload.blob], { type: 'video/mp4' });
  return new File([blob], payload.filename, {
    type: 'video/mp4',
    lastModified: Date.now(),
  });
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Invoke navigator.share synchronously inside a user-gesture handler (tap/click).
 * Always attempts share — canShare often returns false on iOS even when share works.
 */
export function invokeGalleryShareFromGesture(
  payload: VideoFilePayload,
  onResult: (result: ShareResult) => void,
): void {
  if (!navigator.share) {
    onResult('unavailable');
    return;
  }
  const file = toShareFile(payload);
  try {
    if (!isIos() && navigator.canShare && !navigator.canShare({ files: [file] })) {
      onResult('unavailable');
      return;
    }
  } catch {
    /* attempt share anyway */
  }
  navigator
    .share({ files: [file], title: payload.filename })
    .then(() => onResult('shared'))
    .catch((err: unknown) => {
      const name = err instanceof Error ? err.name : '';
      onResult(name === 'AbortError' ? 'cancelled' : 'unavailable');
    });
}

/** Open the iOS/Android share sheet (Save Video → Photos). */
export async function shareVideoToGallery(payload: VideoFilePayload): Promise<ShareResult> {
  if (!navigator.share) return 'unavailable';

  const file = toShareFile(payload);
  try {
    if (!isIos() && navigator.canShare && !navigator.canShare({ files: [file] })) {
      return 'unavailable';
    }
  } catch {
    /* attempt share anyway */
  }

  try {
    await navigator.share({ files: [file], title: payload.filename });
    return 'shared';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}

/** Best-effort auto-open right after async prep (Android; iOS usually blocks). */
export async function autoOpenMobileGallerySave(payload: VideoFilePayload): Promise<ShareResult> {
  cancelMobileGalleryGestureFallback();
  return shareVideoToGallery(payload);
}

/** iOS camera-roll style name — shows as IMG_5567 in the share sheet / Photos. */
export function iosGalleryFilename(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `IMG_${n}.mp4`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileStatus {
  status?: string;
  galleryReady?: boolean;
  galleryFailed?: boolean;
  message?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const GALLERY_POLL_MS = 100;
const FILE_RETRY_MS = 400;
const FILE_FETCH_ATTEMPTS = 12;
const STATUS_404_GRACE_MS = 3_000;
const STATUS_404_RETRIES = 15;

export const MOBILE_GALLERY_CODEC_MSG =
  'This 2K/4K file uses VP9/HEVC (not H.264). Phones can only save H.264 to the gallery — pick 1080p or 720p on mobile, or use a desktop browser for 4K.';

async function readVideoPayloadFromResponse(res: Response): Promise<VideoFilePayload> {
  const blob = await res.blob();
  const head = await blob.slice(0, Math.min(blob.size, 512 * 1024)).arrayBuffer();

  if (looksLikeHtmlOrJson(head) || !isMp4Bytes(head)) {
    throw new Error(HTML_INSTEAD_OF_VIDEO_MSG);
  }
  if (blob.size < 10_000) {
    throw new Error('Video file is too small — the download may have failed. Please try again.');
  }
  if (!isH264Mp4(head)) {
    throw new Error(MOBILE_GALLERY_CODEC_MSG);
  }

  parseFilename(res.headers.get('Content-Disposition'));
  const filename = isMobileDevice() ? iosGalleryFilename() : 'VidCliply-video.mp4';
  return { blob, filename };
}

async function readDesktopVideoPayloadFromResponse(res: Response): Promise<VideoFilePayload> {
  const blob = await res.blob();
  const head = await blob.slice(0, Math.min(blob.size, 512 * 1024)).arrayBuffer();

  if (looksLikeHtmlOrJson(head) || !isMp4Bytes(head)) {
    throw new Error(HTML_INSTEAD_OF_VIDEO_MSG);
  }
  if (blob.size < 10_000) {
    throw new Error('Video file is too small — the download may have failed. Please try again.');
  }

  const filename = parseFilename(res.headers.get('Content-Disposition')) || 'VidCliply-video.mp4';
  return { blob, filename };
}

async function fetchVideoBytes(jobId: string): Promise<VideoFilePayload> {
  const maxAttempts = FILE_FETCH_ATTEMPTS;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/file/${jobId}`), { redirect: 'follow' });
    } catch {
      lastError = new Error('Lost connection while downloading the file. Please try again.');
      if (attempt < maxAttempts) {
        await sleep(FILE_RETRY_MS * attempt);
        continue;
      }
      throw lastError;
    }

    if (res.status === 503 && attempt < maxAttempts) {
      await sleep(FILE_RETRY_MS);
      continue;
    }

    if (!res.ok) {
      try {
        const buf = await res.arrayBuffer();
        const data = JSON.parse(new TextDecoder().decode(buf)) as { error?: string };
        lastError = new Error(data.error ?? 'Could not fetch the video file.');
      } catch {
        lastError = new Error('Could not fetch the video file.');
      }
      if (attempt < maxAttempts) {
        await sleep(FILE_RETRY_MS * attempt);
        continue;
      }
      throw lastError;
    }

    try {
      return await readVideoPayloadFromResponse(res);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Could not fetch the video file.');
      if (attempt < maxAttempts) {
        await sleep(FILE_RETRY_MS * attempt);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Could not fetch the video file.');
}

export async function waitForGalleryReady(jobId: string, timeoutMs = 12 * 60_000): Promise<void> {
  if (!isApiConfigured()) return;

  const started = Date.now();
  let notFoundSince: number | null = null;

  while (Date.now() - started < timeoutMs) {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/file/${jobId}/status`));
    } catch {
      // Transient network blip (or the host briefly waking) — keep polling
      // until the real timeout instead of failing the whole download.
      await sleep(GALLERY_POLL_MS);
      continue;
    }

    if (res.status === 404) {
      if (Date.now() - started < STATUS_404_GRACE_MS) {
        await sleep(GALLERY_POLL_MS);
        continue;
      }
      notFoundSince ??= Date.now();
      if (Date.now() - notFoundSince < STATUS_404_GRACE_MS * STATUS_404_RETRIES) {
        await sleep(GALLERY_POLL_MS);
        continue;
      }
      throw new Error('That download session has expired. Try downloading again.');
    }
    notFoundSince = null;

    const data = (await res.json().catch(() => ({}))) as FileStatus;

    if (res.status === 500 || data.galleryFailed || data.status === 'error') {
      throw new Error(data.message ?? 'Could not prepare this video for your gallery.');
    }

    if (res.ok && data.status === 'ready' && data.galleryReady !== false) {
      return;
    }

    await sleep(GALLERY_POLL_MS);
  }

  throw new Error('Timed out preparing the video for your gallery. Try again.');
}

/** Poll status aggressively and fetch the file as soon as gallery prep finishes. */
export async function waitForMobileGalleryPayload(
  jobId: string,
  timeoutMs = 12 * 60_000,
): Promise<VideoFilePayload> {
  if (!isApiConfigured()) {
    throw new Error(API_NOT_CONFIGURED_MSG);
  }

  const started = Date.now();
  let notFoundSince: number | null = null;

  while (Date.now() - started < timeoutMs) {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/file/${jobId}/status`));
    } catch {
      // Transient network blip (or the host briefly waking) — keep polling
      // until the real timeout instead of failing the whole download.
      await sleep(GALLERY_POLL_MS);
      continue;
    }

    if (res.status === 404) {
      if (Date.now() - started < STATUS_404_GRACE_MS) {
        await sleep(GALLERY_POLL_MS);
        continue;
      }
      notFoundSince ??= Date.now();
      if (Date.now() - notFoundSince < STATUS_404_GRACE_MS * STATUS_404_RETRIES) {
        await sleep(GALLERY_POLL_MS);
        continue;
      }
      throw new Error('That download session has expired. Try downloading again.');
    }
    notFoundSince = null;

    const data = (await res.json().catch(() => ({}))) as FileStatus;

    if (res.status === 500 || data.galleryFailed || data.status === 'error') {
      throw new Error(data.message ?? 'Could not prepare this video for your gallery.');
    }

    if (res.ok && data.status === 'ready' && data.galleryReady !== false) {
      return fetchVideoBytes(jobId);
    }

    await sleep(GALLERY_POLL_MS);
  }

  throw new Error('Timed out preparing the video for your gallery. Try again.');
}

export async function fetchVideoFile(jobId: string): Promise<VideoFilePayload> {
  if (!isApiConfigured()) {
    throw new Error(API_NOT_CONFIGURED_MSG);
  }

  await waitForGalleryReady(jobId);
  return fetchVideoBytes(jobId);
}

/** Retry share a few times — helps when called from the Download button's async chain. */
export async function openGalleryShareSheet(payload: VideoFilePayload): Promise<ShareResult> {
  for (let i = 0; i < 3; i += 1) {
    const result = await shareVideoToGallery(payload);
    if (result !== 'unavailable') return result;
    await sleep(i === 0 ? 0 : 80);
  }
  return 'unavailable';
}

export async function saveMobileVideoToGallery(jobId: string): Promise<void> {
  const payload = await fetchVideoFile(jobId);
  const result = await openGalleryShareSheet(payload);
  if (result === 'unavailable') {
    throw new Error('Could not open the save menu.');
  }
}

async function fetchDesktopVideoBytes(jobId: string): Promise<VideoFilePayload> {
  const maxAttempts = 8;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(apiUrl(`/api/file/${jobId}`));

    if (res.status === 503 && attempt < maxAttempts) {
      await sleep(FILE_RETRY_MS);
      continue;
    }

    if (!res.ok) {
      try {
        const buf = await res.arrayBuffer();
        const data = JSON.parse(new TextDecoder().decode(buf)) as { error?: string };
        lastError = new Error(data.error ?? 'Could not fetch the video file.');
      } catch {
        lastError = new Error('Could not fetch the video file.');
      }
      if (attempt < maxAttempts) {
        await sleep(FILE_RETRY_MS);
        continue;
      }
      throw lastError;
    }

    return readDesktopVideoPayloadFromResponse(res);
  }

  throw lastError ?? new Error('Could not fetch the video file.');
}

/** Fetch the finished file after the job reports ready (mobile gallery path). */
export async function fetchReadyVideoFile(jobId: string): Promise<VideoFilePayload> {
  return fetchVideoBytes(jobId);
}

/**
 * Mobile delivery: wait for server H.264 gallery prep (IG/FB + mobile 2K/4K), then
 * fetch the file for the native save prompt.
 */
export async function deliverMobileVideo(
  jobId: string,
): Promise<{ kind: 'gallery'; payload: VideoFilePayload }> {
  const payload = await waitForMobileGalleryPayload(jobId);
  return { kind: 'gallery', payload };
}

function isCrossOriginApiUrl(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

/**
 * Resolve a download URL against the API host. Refuses to open a same-origin
 * SPA path when VITE_API_URL points elsewhere — that path returns index.html
 * via Vercel's catch-all rewrite instead of the video.
 */
function resolveBrowserDownloadUrl(url: string): string {
  const resolved = url.startsWith('http://') || url.startsWith('https://') ? url : apiUrl(url);

  try {
    const absolute = new URL(resolved, window.location.href);
    // Split deploy (Vercel UI + external API): never download from the SPA origin.
    if (API_BASE) {
      const apiOrigin = new URL(API_BASE).origin;
      if (absolute.origin !== apiOrigin) {
        throw new Error(HTML_INSTEAD_OF_VIDEO_MSG);
      }
    }
    return absolute.href;
  } catch (err) {
    if (err instanceof Error && err.message === HTML_INSTEAD_OF_VIDEO_MSG) {
      throw err;
    }
    throw new Error(INVALID_VIDEO_FILE_MSG);
  }
}

function triggerBlobDownload(payload: VideoFilePayload): void {
  const objectUrl = URL.createObjectURL(payload.blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = payload.filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // iOS Safari needs the blob URL briefly after the click; revoke later.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

/**
 * Cross-origin file delivery without reading the full MP4 into JS memory.
 * A hidden iframe receives the attachment response so the main page stays put.
 * Chrome/Edge then stream straight to disk — much faster than fetch→blob for
 * 100MB–500MB+ files on a fast connection.
 */
function triggerCrossOriginDownload(url: string, filename?: string): void {
  const frameName = `vidcliply-dl-${Date.now()}`;
  const iframe = document.createElement('iframe');
  iframe.name = frameName;
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const a = document.createElement('a');
  a.href = url;
  a.target = frameName;
  a.rel = 'noopener';
  // Hint .mp4 even when the attribute is ignored cross-origin — Content-Disposition
  // still carries the real name from the API.
  a.download = filename && /\.mp4$/i.test(filename) ? filename : 'VidCliply-video.mp4';
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => iframe.remove(), 180_000);
}

/**
 * Desktop large-file path: let the browser download manager stream to disk.
 * Fetching a 500MB remux into JS RAM is far slower than the user's internet.
 */
function startBrowserManagedDownload(
  url: string,
  filename: string,
  onProgress?: (percent: number) => void,
): VideoFilePayload {
  onProgress?.(8);
  triggerCrossOriginDownload(url, filename);
  return { blob: new Blob(), filename, browserManaged: true };
}

/** Map low-level fetch/network errors to user-friendly copy. */
export function formatDownloadError(err: unknown): string {
  if (err instanceof Error && err.message === API_NOT_CONFIGURED_MSG) return err.message;
  if (err instanceof Error) {
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      return 'Could not save the video to your device. Your connection may have dropped while transferring the file — please try again.';
    }
    if (/index\.html/i.test(err.message) || /<!doctype|<html/i.test(err.message)) {
      return HTML_INSTEAD_OF_VIDEO_MSG;
    }
    return err.message;
  }
  return 'Could not save the video. Please try again.';
}

/** Soft ceiling for in-memory fetch on desktop — above this, use the browser tray. */
const DIRECT_FETCH_MAX_BYTES = 48 * 1024 * 1024;
/**
 * Phone in-memory ceiling while streaming a remux into JS. Above this mid-stream
 * we stop — App should have already chosen the job path for huge estimates.
 */
const DIRECT_FETCH_MAX_BYTES_MOBILE = 500 * 1024 * 1024;
/**
 * Mobile: if the stream estimate is above this, skip in-memory fetch and use
 * the server job (real file + Content-Length) so Safari shows download progress.
 * DASH size estimates are often inflated, but 18‑min 1080p routinely clears 300MB.
 */
export const MOBILE_STREAM_JOB_BYTES = 280 * 1024 * 1024;
/**
 * Desktop only: hand off to Chrome/Edge Downloads above this size.
 * Do NOT use this on mobile Safari — remux streams have no Content-Length and
 * stick on “Downloading… Zero KB”.
 */
const BROWSER_MANAGED_THRESHOLD_BYTES = 24 * 1024 * 1024;
/** Brief pause after cancelling a fetch so the stream ticket clears before a second GET. */
const STREAM_HANDOFF_MS = 500;
/** Abort if the remux body sends no bytes for this long (mobile radio + CDN stalls). */
const STREAM_STALL_MS = 45_000;
/** First-byte budget — ffmpeg may need CDN open + mux before headers/body start. */
const STREAM_TTFB_MS = 90_000;
/** Hard ceiling for one in-memory remux attempt. */
const STREAM_ABSOLUTE_TIMEOUT_MS = 12 * 60_000;

export const STREAM_STALL_MSG =
  'The download stalled with no new data. Keep this tab open and try again — on mobile, one download at a time works best.';

export const STREAM_BUSY_MSG =
  'The download service is busy right now. Please wait a few seconds and try again.';

function safeDownloadFilename(filename: string): string {
  const base = (filename || 'VidCliply-video.mp4').replace(/[^\w.\- ]+/g, '_').trim().slice(0, 120);
  const named = base || 'VidCliply-video.mp4';
  return /\.mp4$/i.test(named) ? named : `${named}.mp4`;
}

/** Chromium desktop download manager "Resumes" remux pipes forever (no Range). */
function isChromiumDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const chromium = /Chrome|Chromium|Edg|OPR/i.test(ua) && !/Mobile/i.test(ua);
  return chromium && !isMobileDevice();
}

/** True when the remux blob looks like H.264 (Photos/gallery-safe). */
export async function blobLooksH264(blob: Blob): Promise<boolean> {
  const head = await blob.slice(0, Math.min(blob.size, 512 * 1024)).arrayBuffer();
  return isH264Mp4(head);
}

/**
 * Stream-through delivery for YouTube (and other direct streams).
 *
 * Mobile (esp. Safari): ALWAYS fetch with CORS + in-app byte progress, then
 * save the finished blob. Remux pipes have no Content-Length — handing them to
 * Safari’s download sheet sticks on “Downloading… Zero KB”.
 *
 * Desktop large files (≥ ~24MB): browser Downloads tray streams to disk.
 */
export async function downloadDirectUrl(
  streamUrl: string,
  filename: string,
  options?: {
    estimatedBytes?: number | null;
    onProgress?: (percent: number) => void;
  },
): Promise<VideoFilePayload> {
  const url = resolveBrowserDownloadUrl(streamUrl);
  const safeName = safeDownloadFilename(filename);
  const estimated = options?.estimatedBytes ?? null;
  const mobile = isMobileDevice();
  const maxBytes = mobile ? DIRECT_FETCH_MAX_BYTES_MOBILE : DIRECT_FETCH_MAX_BYTES;

  // Desktop large only — never iframe on mobile (Safari Zero KB on remux).
  if (!mobile && estimated != null && estimated > BROWSER_MANAGED_THRESHOLD_BYTES) {
    const payload = startBrowserManagedDownload(url, safeName, options?.onProgress);
    await new Promise((r) => window.setTimeout(r, 1200));
    options?.onProgress?.(100);
    return payload;
  }

  // Do NOT refuse on estimate alone — DASH filesize_approx is often inflated.
  // App.tsx routes truly huge mobile estimates to the job pipeline instead.

  let lastErr: unknown;
  const attempts = mobile ? 2 : isChromiumDesktop() ? 3 : 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const payload = await downloadDirectViaFetch(
        url,
        safeName,
        estimated,
        maxBytes,
        options?.onProgress,
        // Desktop may upgrade to Downloads tray mid-stream. Mobile must not —
        // that reopens the Safari Zero KB attachment path.
        !mobile,
      );
      if (payload.browserManaged) {
        await new Promise((r) => window.setTimeout(r, 1200));
        options?.onProgress?.(100);
        return payload;
      }
      // Desktop / Android: also write Files. iOS uses Save-to-Gallery via a
      // fresh tap (MobileSavePrompt) — async <a download> is unreliable there.
      if (!mobile || !isIos()) {
        triggerBlobDownload(payload);
      }
      options?.onProgress?.(100);
      return payload;
    } catch (err) {
      lastErr = err;
      if (
        err instanceof Error &&
        (err.message === HTML_INSTEAD_OF_VIDEO_MSG ||
          err.message === INVALID_VIDEO_FILE_MSG ||
          err.message === STREAM_STALL_MSG)
      ) {
        throw err;
      }
      if (err instanceof Error && /stream HTTP 503|stream HTTP 409/.test(err.message)) {
        if (attempt < attempts) {
          options?.onProgress?.(Math.max(2, 3 * attempt));
          await new Promise((r) => window.setTimeout(r, 1200 * attempt));
          continue;
        }
        throw new Error(STREAM_BUSY_MSG);
      }
      if (attempt < attempts) {
        options?.onProgress?.(Math.max(2, 4 * attempt));
        await new Promise((r) => window.setTimeout(r, 800 * attempt));
      }
    }
  }

  // Desktop last resort: browser-managed. Mobile: surface the real error —
  // iframe fallback is what caused Zero KB.
  if (!mobile) {
    const payload = startBrowserManagedDownload(url, safeName, options?.onProgress);
    await new Promise((r) => window.setTimeout(r, 1200));
    options?.onProgress?.(100);
    return payload;
  }

  throw lastErr instanceof Error ? lastErr : new Error(STREAM_STALL_MSG);
}

async function downloadDirectViaFetch(
  url: string,
  filename: string,
  estimatedBytes: number | null,
  maxBytes: number,
  onProgress?: (percent: number) => void,
  allowBrowserManagedUpgrade = false,
): Promise<VideoFilePayload> {
  onProgress?.(3);

  const controller = new AbortController();
  const absTimer = window.setTimeout(() => controller.abort(), STREAM_ABSOLUTE_TIMEOUT_MS);
  let stallTimer = window.setTimeout(() => controller.abort(), STREAM_TTFB_MS);
  const bumpStallWatchdog = () => {
    window.clearTimeout(stallTimer);
    stallTimer = window.setTimeout(() => controller.abort(), STREAM_STALL_MS);
  };
  const clearWatchdogs = () => {
    window.clearTimeout(absTimer);
    window.clearTimeout(stallTimer);
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      mode: 'cors',
      signal: controller.signal,
    });
  } catch (err) {
    clearWatchdogs();
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(STREAM_STALL_MSG);
    }
    throw err;
  }

  bumpStallWatchdog();

  if (!res.ok || !res.body) {
    clearWatchdogs();
    throw new Error(`stream HTTP ${res.status}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    clearWatchdogs();
    try {
      await res.body.cancel();
    } catch {
      /* ignore */
    }
    throw new Error(HTML_INSTEAD_OF_VIDEO_MSG);
  }

  const total =
    Number(res.headers.get('content-length')) ||
    Number(res.headers.get('x-expected-size')) ||
    (estimatedBytes && estimatedBytes > 0 ? estimatedBytes : 0);

  const handoffToBrowser = async (): Promise<VideoFilePayload> => {
    clearWatchdogs();
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    // Let the server clear transferActive before the Downloads-tray GET.
    await new Promise((r) => window.setTimeout(r, STREAM_HANDOFF_MS));
    return startBrowserManagedDownload(url, filename, onProgress);
  };

  // Desktop: headers say big file — abort the RAM buffer and use Downloads tray.
  if (allowBrowserManagedUpgrade && total > BROWSER_MANAGED_THRESHOLD_BYTES) {
    return handoffToBrowser();
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  let lastProgressAt = 0;

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(STREAM_STALL_MSG);
        }
        throw err;
      }
      const { done, value } = chunk;
      if (done) break;
      bumpStallWatchdog();
      chunks.push(value as BlobPart);
      received += value.byteLength;

      if (
        allowBrowserManagedUpgrade &&
        received > BROWSER_MANAGED_THRESHOLD_BYTES &&
        (total === 0 || total > BROWSER_MANAGED_THRESHOLD_BYTES)
      ) {
        await reader.cancel().catch(() => undefined);
        clearWatchdogs();
        await new Promise((r) => window.setTimeout(r, STREAM_HANDOFF_MS));
        return startBrowserManagedDownload(url, filename, onProgress);
      }

      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        clearWatchdogs();
        throw new Error(STREAM_STALL_MSG);
      }
      const now = performance.now();
      if (now - lastProgressAt < 120 && received > 64 * 1024) continue;
      lastProgressAt = now;
      if (total > 0) {
        onProgress?.(Math.min(99, Math.max(3, Math.round((received / total) * 100))));
      } else {
        // Remux has no Content-Length — nudge from bytes so the bar is not stuck at 0.
        onProgress?.(Math.min(95, 5 + Math.floor(received / (512 * 1024))));
      }
    }
  } finally {
    clearWatchdogs();
  }

  if (received < 64) {
    throw new Error(INVALID_VIDEO_FILE_MSG);
  }

  const blob = new Blob(chunks, { type: 'video/mp4' });
  const head = await blob.slice(0, 256).arrayBuffer();
  const ftyp = await blob.slice(0, 12).arrayBuffer();
  if (looksLikeHtmlOrJson(head) || !isMp4Bytes(ftyp)) {
    throw new Error(INVALID_VIDEO_FILE_MSG);
  }

  return { blob, filename };
}

/**
 * Deliver a finished job to the user's downloads folder.
 * Cross-origin APIs use a hidden iframe (no full-file blob read).
 * Same-origin deploys still use blob download when possible.
 */
export async function downloadFileToDevice(jobId: string): Promise<void> {
  const url = resolveBrowserDownloadUrl(apiUrl(`/api/file/${jobId}`));
  if (!isApiConfigured()) throw new Error(API_NOT_CONFIGURED_MSG);

  if (isCrossOriginApiUrl(url)) {
    triggerCrossOriginDownload(url, 'VidCliply-video.mp4');
    return;
  }

  try {
    const payload = await fetchDesktopVideoBytes(jobId);
    triggerBlobDownload(payload);
  } catch (err) {
    // Blob path already validates HTML; fall back to iframe only for network blips.
    if (err instanceof Error && (err.message === HTML_INSTEAD_OF_VIDEO_MSG || err.message === INVALID_VIDEO_FILE_MSG)) {
      throw err;
    }
    triggerCrossOriginDownload(url, 'VidCliply-video.mp4');
  }
}

/** @deprecated Use downloadFileToDevice — kept for any legacy imports. */
export function classicFileDownload(jobId: string): void {
  void downloadFileToDevice(jobId);
}
