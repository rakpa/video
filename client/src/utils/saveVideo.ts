import { apiUrl } from '../config/api';

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

export interface VideoFilePayload {
  blob: Blob;
  filename: string;
}

/** Simple ASCII name — iOS Photos ignores some unicode / odd filenames from IG titles. */
export function gallerySafeFilename(original: string): string {
  const stem = original
    .replace(/\.[^/.]+$/, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 48);
  return `${stem || 'ClipVault-video'}.mp4`;
}

/** Fetch the finished MP4 once (job is removed server-side after stream). */
export async function fetchVideoFile(jobId: string): Promise<VideoFilePayload> {
  const res = await fetch(apiUrl(`/api/file/${jobId}`));
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Could not fetch the video file.');
  }
  const rawName = parseFilename(res.headers.get('Content-Disposition'));
  const blob = new Blob([await res.arrayBuffer()], { type: 'video/mp4' });
  return { blob, filename: gallerySafeFilename(rawName) };
}

/** Open the OS share sheet so the user can pick Save Video / Photos / Gallery. */
export async function shareVideoToGallery(payload: VideoFilePayload): Promise<void> {
  const file = new File([payload.blob], payload.filename, { type: 'video/mp4' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: payload.filename });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err instanceof Error ? err : new Error('Could not open the save menu.');
    }
  }

  // Fallback: trigger a download (may land in Downloads on some devices).
  const url = URL.createObjectURL(payload.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = payload.filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
