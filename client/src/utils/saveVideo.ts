import { API_NOT_CONFIGURED_MSG, apiUrl, isApiConfigured } from '../config/api';

/** True on the installed Capacitor app — not mobile Safari/Chrome. */
export function isNativeMobileApp(): boolean {
  return false;
}

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
const FILE_RETRY_MS = 150;
const STATUS_404_GRACE_MS = 3_000;
const STATUS_404_RETRIES = 15;

export const MOBILE_GALLERY_CODEC_MSG =
  'This 2K/4K file uses VP9/HEVC (not H.264). Phones can only save H.264 to the gallery — pick 1080p or 720p on mobile, or use a desktop browser for 4K.';

async function readVideoPayloadFromResponse(res: Response): Promise<VideoFilePayload> {
  const blob = await res.blob();
  const head = await blob.slice(0, Math.min(blob.size, 512 * 1024)).arrayBuffer();

  if (looksLikeHtmlOrJson(head) || !isMp4Bytes(head)) {
    throw new Error(
      'Received an invalid file (not MP4). The download API may be misconfigured — check VITE_API_URL on Vercel.',
    );
  }
  if (blob.size < 10_000) {
    throw new Error('Video file is too small — the download may have failed.');
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
    throw new Error(
      'Received an invalid file (not MP4). The download API may be misconfigured — check VITE_API_URL on Vercel.',
    );
  }
  if (blob.size < 10_000) {
    throw new Error('Video file is too small — the download may have failed.');
  }

  const filename = parseFilename(res.headers.get('Content-Disposition')) || 'VidCliply-video.mp4';
  return { blob, filename };
}

/**
 * Read the finished file as a share payload WITHOUT the H.264 gallery gate.
 * For 2K/4K on a mobile browser: YouTube has no H.264 variant at those heights,
 * so instead of blocking on a slow server transcode we hand the raw MP4 to the
 * OS share sheet and let the user pick Save Video (if the phone accepts it) or
 * Save to Files. iOS Photos only takes H.264, so 4K typically lands in Files.
 */
async function readRawSharePayloadFromResponse(res: Response): Promise<VideoFilePayload> {
  const blob = await res.blob();
  const head = await blob.slice(0, Math.min(blob.size, 512 * 1024)).arrayBuffer();

  if (looksLikeHtmlOrJson(head) || !isMp4Bytes(head)) {
    throw new Error(
      'Received an invalid file (not MP4). The download API may be misconfigured — check VITE_API_URL on Vercel.',
    );
  }
  if (blob.size < 10_000) {
    throw new Error('Video file is too small — the download may have failed.');
  }

  return { blob, filename: iosGalleryFilename() };
}

async function fetchVideoBytes(
  jobId: string,
  read: (res: Response) => Promise<VideoFilePayload> = readVideoPayloadFromResponse,
): Promise<VideoFilePayload> {
  const maxAttempts = 8;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/file/${jobId}`));
    } catch {
      // Network dropped while fetching the file — retry a few times before
      // surfacing an error, so a brief blip doesn't fail a finished download.
      lastError = new Error('Lost connection while downloading the file. Please try again.');
      if (attempt < maxAttempts) {
        await sleep(FILE_RETRY_MS);
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
        await sleep(FILE_RETRY_MS);
        continue;
      }
      throw lastError;
    }

    return read(res);
  }

  throw lastError ?? new Error('Could not fetch the video file.');
}

/**
 * Mobile 2K/4K delivery: fetch the finished file (no server transcode, so no
 * 99% "merging" hang) for the Save-to-Gallery share sheet. Skips the H.264 gate
 * — the OS decides Save Video vs Save to Files.
 */
export async function fetchRawShareFile(jobId: string): Promise<VideoFilePayload> {
  if (!isApiConfigured()) {
    throw new Error(API_NOT_CONFIGURED_MSG);
  }
  return fetchVideoBytes(jobId, readRawSharePayloadFromResponse);
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
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Cross-origin file delivery without reading the full MP4 into JS memory.
 * A hidden iframe receives the attachment response so the main page stays put.
 */
function triggerCrossOriginDownload(url: string): void {
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
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => iframe.remove(), 120_000);
}

/** Map low-level fetch/network errors to user-friendly copy. */
export function formatDownloadError(err: unknown): string {
  if (err instanceof Error && err.message === API_NOT_CONFIGURED_MSG) return err.message;
  if (err instanceof Error) {
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      return 'Could not save the video to your device. Your connection may have dropped while transferring the file — please try again.';
    }
    return err.message;
  }
  return 'Could not save the video.';
}

/**
 * Deliver a finished job to the user's downloads folder.
 * Cross-origin APIs use a hidden iframe (no full-file blob read).
 * Same-origin deploys still use blob download when possible.
 */
export async function downloadFileToDevice(jobId: string): Promise<void> {
  const url = apiUrl(`/api/file/${jobId}`);
  if (!isApiConfigured()) throw new Error(API_NOT_CONFIGURED_MSG);

  if (isCrossOriginApiUrl(url)) {
    triggerCrossOriginDownload(url);
    return;
  }

  try {
    const payload = await fetchDesktopVideoBytes(jobId);
    triggerBlobDownload(payload);
  } catch {
    triggerCrossOriginDownload(url);
  }
}

/** @deprecated Use downloadFileToDevice — kept for any legacy imports. */
export function classicFileDownload(jobId: string): void {
  void downloadFileToDevice(jobId);
}
