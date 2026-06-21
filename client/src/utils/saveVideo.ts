import { API_NOT_CONFIGURED_MSG, apiUrl, isApiConfigured } from '../config/api';

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

async function readVideoPayloadFromResponse(res: Response): Promise<VideoFilePayload> {
  const buf = await res.arrayBuffer();

  if (looksLikeHtmlOrJson(buf) || !isMp4Bytes(buf)) {
    throw new Error(
      'Received an invalid file (not MP4). The download API may be misconfigured — check VITE_API_URL on Vercel.',
    );
  }
  if (buf.byteLength < 10_000) {
    throw new Error('Video file is too small — the download may have failed.');
  }
  if (!isH264Mp4(buf)) {
    throw new Error(
      'This video is not in a gallery-compatible format (H.264). Try again or pick 720p.',
    );
  }

  parseFilename(res.headers.get('Content-Disposition'));
  const blob = new Blob([buf], { type: 'video/mp4' });
  const filename = isMobileDevice() ? iosGalleryFilename() : 'ClipVault-video.mp4';
  return { blob, filename };
}

async function fetchVideoBytes(jobId: string): Promise<VideoFilePayload> {
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

    return readVideoPayloadFromResponse(res);
  }

  throw lastError ?? new Error('Could not fetch the video file.');
}

export async function waitForGalleryReady(jobId: string, timeoutMs = 12 * 60_000): Promise<void> {
  if (!isApiConfigured()) return;

  const started = Date.now();
  let notFoundSince: number | null = null;

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(apiUrl(`/api/file/${jobId}/status`));

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
    const res = await fetch(apiUrl(`/api/file/${jobId}/status`));

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

function toShareFile(payload: VideoFilePayload): File {
  return new File([payload.blob], payload.filename, {
    type: 'video/mp4',
    lastModified: Date.now(),
  });
}

/** Open the iOS/Android share sheet (Save Video → Photos). */
export async function shareVideoToGallery(payload: VideoFilePayload): Promise<ShareResult> {
  if (!navigator.share) return 'unavailable';

  const file = toShareFile(payload);
  const canShareFiles = navigator.canShare?.({ files: [file] }) ?? true;

  if (!canShareFiles) return 'unavailable';

  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
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

export function classicFileDownload(jobId: string): void {
  const a = document.createElement('a');
  a.href = apiUrl(`/api/file/${jobId}`);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
