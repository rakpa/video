import { API_NOT_CONFIGURED_MSG, apiUrl, isApiConfigured } from '../config/api';

/** Phones/tablets — coarse pointer or common mobile UA. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return mobileUa || (coarse && navigator.maxTouchPoints > 0);
}

function parseFilename(header: string | null): string {
  if (!header) return 'ClipVault-video.mp4';
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^\s;]+)/i.exec(header);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) return 'ClipVault-video.mp4';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** MP4/MOV files contain an `ftyp` box near the start. */
function isMp4Bytes(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const v = new DataView(buf);
  return v.getUint8(4) === 0x66 && v.getUint8(5) === 0x74 && v.getUint8(6) === 0x79 && v.getUint8(7) === 0x70;
}

function looksLikeHtmlOrJson(buf: ArrayBuffer): boolean {
  const head = new TextDecoder().decode(buf.slice(0, Math.min(256, buf.byteLength))).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{');
}

export interface VideoFilePayload {
  blob: Blob;
  filename: string;
}

/** Simple ASCII name — iOS Photos ignores odd unicode filenames from IG titles. */
export function gallerySafeFilename(original: string): string {
  const stem = original
    .replace(/\.[^/.]+$/, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 48);
  return `${stem || 'ClipVault-video'}.mp4`;
}

/** Fetch the finished MP4 and verify it is real video — not an HTML error page. */
export async function fetchVideoFile(jobId: string): Promise<VideoFilePayload> {
  if (!isApiConfigured()) {
    throw new Error(API_NOT_CONFIGURED_MSG);
  }

  const res = await fetch(apiUrl(`/api/file/${jobId}`));
  const buf = await res.arrayBuffer();

  if (!res.ok) {
    try {
      const data = JSON.parse(new TextDecoder().decode(buf)) as { error?: string };
      throw new Error(data.error ?? 'Could not fetch the video file.');
    } catch (e) {
      if (e instanceof Error && e.message !== 'Could not fetch the video file.') throw e;
      throw new Error('Could not fetch the video file.');
    }
  }

  if (looksLikeHtmlOrJson(buf) || !isMp4Bytes(buf)) {
    throw new Error(
      'Received an invalid file (not MP4). The download API may be misconfigured — check VITE_API_URL on Vercel.',
    );
  }
  if (buf.byteLength < 10_000) {
    throw new Error('Video file is too small — the download may have failed.');
  }

  const rawName = parseFilename(res.headers.get('Content-Disposition'));
  const blob = new Blob([buf], { type: 'video/mp4' });
  return { blob, filename: gallerySafeFilename(rawName) };
}

/** Full-screen video player so the user can Save Video from the native controls. */
function openVideoSaveViewer(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Save video');
  overlay.className = 'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-5';

  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.playsInline = true;
  video.autoplay = true;
  video.className = 'max-h-[65vh] w-full max-w-lg rounded-xl bg-black';

  const hint = document.createElement('p');
  hint.className = 'mt-4 max-w-sm text-center text-sm text-white/90';
  hint.textContent =
    'Tap the Share icon on the video (or below it), then choose Save Video / Save to Photos.';

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'mt-5 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-900';
  done.textContent = 'Done';
  done.onclick = () => {
    URL.revokeObjectURL(url);
    overlay.remove();
  };

  overlay.append(video, hint, done);
  document.body.appendChild(overlay);
  void video.play().catch(() => undefined);
}

/**
 * Share the MP4 via the OS sheet (Save Video / Photos).
 * Never pass title/url — that makes iOS share a webpage preview instead of the file.
 */
export async function shareVideoToGallery(payload: VideoFilePayload): Promise<void> {
  const file = new File([payload.blob], payload.filename, { type: 'video/mp4' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Fall through to inline video viewer
    }
  }

  openVideoSaveViewer(payload.blob, payload.filename);
}

/**
 * Mobile save: fetch validated MP4 → share sheet → inline video fallback.
 * Last resort: open the API file URL directly (native browser video player).
 */
export async function saveMobileVideoToGallery(jobId: string): Promise<void> {
  try {
    const payload = await fetchVideoFile(jobId);
    await shareVideoToGallery(payload);
  } catch {
    // Stream directly from API — avoids corrupt in-memory blobs; opens native player.
    window.location.assign(apiUrl(`/api/file/${jobId}`));
  }
}

/** Desktop: stream via hidden link (no full-file memory buffer). */
export function classicFileDownload(jobId: string): void {
  const a = document.createElement('a');
  a.href = apiUrl(`/api/file/${jobId}`);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
