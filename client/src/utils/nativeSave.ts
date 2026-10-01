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

/** 'photos' = saved straight to the Photos library; 'shared' = via the share sheet. */
export type NativeSaveResult = 'photos' | 'shared' | 'cancelled';

interface NativeFile {
  /** Per-download cache folder (removed when the next download starts). */
  dir: string;
  path: string;
  uri: string;
  name: string;
}

/** The most recent download stays in the app cache so it can be re-saved/shared. */
let lastFile: NativeFile | null = null;
let lastOutcome: NativeSaveResult | null = null;

export function lastNativeOutcome(): NativeSaveResult | null {
  return lastOutcome;
}

export function hasNativeFile(): boolean {
  return lastFile !== null;
}

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

async function dropPreviousFile(): Promise<void> {
  const prev = lastFile;
  lastFile = null;
  lastOutcome = null;
  if (!prev) return;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await Filesystem.rmdir({ path: prev.dir, directory: Directory.Cache, recursive: true }).catch(() => undefined);
}

/** iOS share sheet: "Save to Files" (pick a folder), AirDrop, "Save Video", … */
async function openShareSheet(file: NativeFile): Promise<NativeSaveResult> {
  const { Share } = await import('@capacitor/share');
  try {
    await Share.share({ title: file.name, files: [file.uri], dialogTitle: 'Save video' });
    return 'shared';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(msg)) return 'cancelled';
    throw err;
  }
}

/**
 * Deliver a finished file: save it straight into the Photos library (what
 * people expect from a downloader). If Photos refuses — permission denied or a
 * codec Photos can't hold — fall back to the share sheet so the user can still
 * choose Files or another app. WKWebView ignores <a download> and would play
 * the video inline, so the native app routes every download through here.
 */
async function deliver(file: NativeFile): Promise<NativeSaveResult> {
  lastFile = file;
  try {
    const { Media } = await import('@capacitor-community/media');
    await Media.saveVideo({ path: file.uri });
    lastOutcome = 'photos';
  } catch {
    lastOutcome = await openShareSheet(file);
  }
  return lastOutcome;
}

/** Re-open the share sheet for the last download (Save to Files / share). */
export async function shareLastNative(): Promise<NativeSaveResult | null> {
  if (!lastFile) return null;
  return openShareSheet(lastFile);
}

/**
 * Stream a URL straight into the app cache (never holds the whole file in
 * memory), then deliver it. Calls onProgress with 0–100.
 */
export async function saveUrlNative(
  url: string,
  filename: string,
  onProgress?: (percent: number) => void,
  estimatedBytes?: number | null,
): Promise<NativeSaveResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await dropPreviousFile();
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`stream HTTP ${res.status}`);
  }
  // Prefer the server's real title (Content-Disposition) over a generic name.
  const cd = res.headers.get('content-disposition') ?? '';
  const cdMatch = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
  let headerName = '';
  try {
    headerName = cdMatch?.[1] ? decodeURIComponent(cdMatch[1]) : (cdMatch?.[2] ?? '');
  } catch {
    headerName = cdMatch?.[2] ?? '';
  }
  const name = safeName(headerName || filename);
  const dir = `vidcliply-${Date.now()}`;
  const path = `${dir}/${name}`;
  const total =
    Number(res.headers.get('content-length')) ||
    Number(res.headers.get('x-expected-size')) ||
    estimatedBytes ||
    0;

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
      await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
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
      if (total > 0) onProgress?.(Math.min(99, Math.max(2, Math.round((received / total) * 100))));
      if (pendingBytes >= WRITE_CHUNK_BYTES) await flush();
    }
    await flush();
    if (received < 1024) throw new Error('The video file was empty. Please try again.');
    onProgress?.(100);
  } catch (err) {
    Filesystem.rmdir({ path: dir, directory: Directory.Cache, recursive: true }).catch(() => undefined);
    throw err;
  }

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return deliver({ dir, path, uri, name });
}

/** Same as saveUrlNative for a file already in memory (job / gallery-prep path). */
export async function saveBlobNative(blob: Blob, filename: string): Promise<NativeSaveResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await dropPreviousFile();
  const name = safeName(filename);
  const dir = `vidcliply-${Date.now()}`;
  const path = `${dir}/${name}`;
  try {
    for (let off = 0; off < blob.size; off += WRITE_CHUNK_BYTES) {
      const chunk = new Uint8Array(await blob.slice(off, off + WRITE_CHUNK_BYTES).arrayBuffer());
      const data = await toBase64(chunk);
      if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
      else await Filesystem.appendFile({ path, data, directory: Directory.Cache });
    }
  } catch (err) {
    Filesystem.rmdir({ path: dir, directory: Directory.Cache, recursive: true }).catch(() => undefined);
    throw err;
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return deliver({ dir, path, uri, name });
}
