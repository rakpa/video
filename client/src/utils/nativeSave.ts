import { Capacitor } from '@capacitor/core';

/** True inside the installed Capacitor iOS/Android app (not mobile Safari). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

const WRITE_CHUNK_BYTES = 4 * 1024 * 1024;

function safeName(name: string): string {
  const base = (name || 'video.mp4').replace(/[^\w.\- ]+/g, '_').trim().slice(0, 100) || 'video';
  return /\.mp4$/i.test(base) ? base : `${base}.mp4`;
}

async function toBase64(bytes: Uint8Array): Promise<string> {
  const blob = new Blob([bytes as BlobPart]);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode video chunk.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

export type NativeSaveResult = 'shared' | 'cancelled';

/**
 * Open the iOS share sheet for a finished file: "Save Video" puts it in Photos,
 * "Save to Files" lets the user pick a folder. WKWebView ignores <a download>
 * and would play the video inline instead, so the native app routes every
 * finished download through here.
 */
async function shareFile(uri: string, filename: string): Promise<NativeSaveResult> {
  const { Share } = await import('@capacitor/share');
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Save video' });
    return 'shared';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(msg)) return 'cancelled';
    throw err;
  }
}

/**
 * Stream a URL straight into the app cache (never holds the whole file in
 * memory), then show the share sheet. Calls onProgress with 0–100.
 */
export async function saveUrlNative(
  url: string,
  filename: string,
  onProgress?: (percent: number) => void,
  estimatedBytes?: number | null,
): Promise<NativeSaveResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const name = safeName(filename);
  const path = `vidcliply-${Date.now()}-${name}`;

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`stream HTTP ${res.status}`);
  }
  const total = Number(res.headers.get('content-length')) || estimatedBytes || 0;

  const reader = res.body.getReader();
  let received = 0;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let wroteAny = false;

  const flush = async () => {
    if (pendingBytes === 0) return;
    const merged = new Uint8Array(pendingBytes);
    let off = 0;
    for (const c of pending) {
      merged.set(c, off);
      off += c.length;
    }
    pending = [];
    pendingBytes = 0;
    const data = await toBase64(merged);
    if (!wroteAny) {
      await Filesystem.writeFile({ path, data, directory: Directory.Cache });
      wroteAny = true;
    } else {
      await Filesystem.appendFile({ path, data, directory: Directory.Cache });
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending.push(value);
      pendingBytes += value.length;
      received += value.length;
      if (total > 0) onProgress?.(Math.min(99, Math.round((received / total) * 100)));
      if (pendingBytes >= WRITE_CHUNK_BYTES) await flush();
    }
    await flush();
    if (received < 1024) throw new Error('The video file was empty. Please try again.');
    onProgress?.(100);

    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    return await shareFile(uri, name);
  } finally {
    Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

/** Same as saveUrlNative for a file already in memory (Instagram/job path). */
export async function saveBlobNative(blob: Blob, filename: string): Promise<NativeSaveResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const name = safeName(filename);
  const path = `vidcliply-${Date.now()}-${name}`;
  try {
    for (let off = 0; off < blob.size; off += WRITE_CHUNK_BYTES) {
      const chunk = new Uint8Array(await blob.slice(off, off + WRITE_CHUNK_BYTES).arrayBuffer());
      const data = await toBase64(chunk);
      if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache });
      else await Filesystem.appendFile({ path, data, directory: Directory.Cache });
    }
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    return await shareFile(uri, name);
  } finally {
    Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}
