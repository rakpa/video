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

/** Scan the MP4 header for H.264 (avc1) vs HEVC (hvc1/hev1) track tags. */
function mp4VideoCodec(buf: ArrayBuffer): 'h264' | 'hevc' | 'unknown' {
  const bytes = new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 512 * 1024)));
  let hasAvc1 = false;
  let hasHevc = false;
  for (let i = 0; i <= bytes.length - 4; i += 1) {
    const c0 = bytes[i];
    const c1 = bytes[i + 1];
    const c2 = bytes[i + 2];
    const c3 = bytes[i + 3];
    if (c0 === 0x61 && c1 === 0x76 && c2 === 0x63 && c3 === 0x31) hasAvc1 = true;
    if ((c0 === 0x68 && c1 === 0x76 && c2 === 0x63 && c3 === 0x31) || (c0 === 0x68 && c1 === 0x65 && c2 === 0x76 && c3 === 0x31)) {
      hasHevc = true;
    }
  }
  if (hasAvc1 && !hasHevc) return 'h264';
  if (hasHevc && !hasAvc1) return 'hevc';
  if (hasAvc1) return 'h264';
  return 'unknown';
}

export interface VideoFilePayload {
  blob: Blob;
  filename: string;
}

/** Simple ASCII name — iOS Photos ignores odd unicode filenames from IG titles. */
export function gallerySafeFilename(original: string, forceGeneric = false): string {
  if (forceGeneric) return 'ClipVault-video.mp4';
  const stem = original
    .replace(/\.[^/.]+$/, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 48);
  return `${stem || 'ClipVault-video'}.mp4`;
}

function needsGalleryWait(platform?: string): boolean {
  return platform === 'instagram' || platform === 'facebook';
}

/**
 * Wait until the API finishes the H.264 transcode (Instagram/Facebook) so iOS
 * offers "Save Video" (Photos) instead of only "Save to Files".
 */
async function waitForGalleryReady(jobId: string, maxWaitMs = 120_000): Promise<void> {
  const start = Date.now();
  let transientErrors = 0;
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(apiUrl(`/api/file/${jobId}/status`));
      if (res.status === 404 || res.status === 410) {
        throw new Error('That download session has expired — please download again.');
      }
      if (res.ok) {
        const data = (await res.json()) as { status?: string; galleryReady?: boolean; galleryFailed?: boolean };
        if (data.status === 'ready' && data.galleryReady === true) return;
        // Server is retrying transcode — keep polling.
        if (data.galleryFailed) transientErrors = 0;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('expired')) throw err;
      if (++transientErrors > 8) {
        throw new Error('Could not check the video status. Check your connection and try Save again.');
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  // Timed out waiting for the optional transcode — proceed anyway. The file route
  // blocks until ready (and falls back to the original H.264 download), so a
  // best-effort fetch still succeeds instead of dead-ending on an error screen.
}

/** Fetch the finished MP4 and verify it is real H.264 video — not HEVC or an error page. */
export async function fetchVideoFile(jobId: string, platform?: string): Promise<VideoFilePayload> {
  if (!isApiConfigured()) {
    throw new Error(API_NOT_CONFIGURED_MSG);
  }

  const requireH264 = needsGalleryWait(platform);
  if (requireH264) {
    await waitForGalleryReady(jobId);
  }

  const maxAttempts = requireH264 ? 8 : 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(apiUrl(`/api/file/${jobId}`));
    const buf = await res.arrayBuffer();

    if (res.status === 503 && requireH264 && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }

    if (!res.ok) {
      try {
        const data = JSON.parse(new TextDecoder().decode(buf)) as { error?: string };
        lastError = new Error(data.error ?? 'Could not fetch the video file.');
      } catch {
        lastError = new Error('Could not fetch the video file.');
      }
      if (requireH264 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      throw lastError;
    }

    if (looksLikeHtmlOrJson(buf) || !isMp4Bytes(buf)) {
      throw new Error(
        'Received an invalid file (not MP4). The download API may be misconfigured — check VITE_API_URL on Vercel.',
      );
    }
    if (buf.byteLength < 10_000) {
      throw new Error('Video file is too small — the download may have failed.');
    }

    // Give the background transcode a few more tries to deliver H.264; if it is
    // still HEVC on the final attempt, share it anyway — landing in Files beats a
    // dead-end error, and IG/FB run in compatible (H.264) mode so this is rare.
    const codec = mp4VideoCodec(buf);
    if (requireH264 && codec === 'hevc' && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }

    const rawName = parseFilename(res.headers.get('Content-Disposition'));
    const blob = new Blob([buf], { type: 'video/mp4' });
    const forceGeneric = requireH264;
    return { blob, filename: gallerySafeFilename(rawName, forceGeneric) };
  }

  throw lastError ?? new Error('Could not fetch the video file.');
}

/** Full-screen video player so the user can Save Video from the native controls. */
function openVideoSaveViewer(blob: Blob, _filename: string): void {
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
  const file = new File([payload.blob], payload.filename, {
    type: 'video/mp4',
    lastModified: Date.now(),
  });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  openVideoSaveViewer(payload.blob, payload.filename);
}

/**
 * Mobile save: wait for gallery transcode (IG/FB) → fetch validated H.264 MP4 → share sheet.
 */
export async function saveMobileVideoToGallery(jobId: string, platform?: string): Promise<void> {
  const payload = await fetchVideoFile(jobId, platform);
  await shareVideoToGallery(payload);
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
