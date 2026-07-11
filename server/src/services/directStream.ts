import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { currentProxy } from '../config.js';
import { getFreshInfoJson } from './infoJsonCache.js';
import type { CodecMode, QualityDef } from './formats.js';
import { detectPlatform, type PlatformId } from './platform.js';
import { logger } from '../utils/logger.js';

/**
 * SaveFrom-style direct passthrough. When the source already offers a
 * pre-muxed MP4 (video+audio in one file) at the best quality we could
 * deliver anyway, there is nothing for yt-dlp/ffmpeg to do — the file can be
 * piped straight from the platform's CDN to the visitor's browser. No temp
 * disk, no merge, no worker slot: a pure pipe, so thousands can run at once.
 *
 * The media URLs come from the cached `yt-dlp -J` dump produced by /api/info.
 * They are time-limited and IP-locked to the proxy that extracted them, so
 * each registry entry pins the proxy it must stream through.
 */

interface RawFormat {
  format_id?: string;
  url?: string;
  ext?: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  http_headers?: Record<string, string>;
}

interface RawDump {
  title?: string;
  formats?: RawFormat[];
}

export interface DirectStreamEntry {
  id: string;
  mediaUrl: string;
  /** Proxy the info-json was extracted through — the stream MUST reuse it. */
  proxy: string;
  /** Upstream request headers yt-dlp recorded for this format (UA, referer…). */
  headers: Record<string, string>;
  filename: string;
  height: number;
  qualityLabel: string;
  requestedHeight: number;
  platformId?: PlatformId;
  filesize: number | null;
  ip?: string;
  createdAt: number;
}

/** Entries expire well inside the info-json TTL so we never pipe a dead URL. */
const REGISTRY_TTL_MS = 10 * 60 * 1000;
const registry = new Map<string, DirectStreamEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [id, e] of registry) {
    if (now - e.createdAt > REGISTRY_TTL_MS) registry.delete(id);
  }
}, 60_000).unref();

/** Streams currently piping through this process. Pure I/O, but still capped. */
let activeStreams = 0;
export function beginStream(): void {
  activeStreams += 1;
}
export function endStream(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}
export function activeStreamCount(): number {
  return activeStreams;
}

const maxActiveStreams = Math.max(1, Number(process.env.DIRECT_STREAM_MAX ?? 1000));

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'video';
}

/** Pre-muxed, plain-HTTPS, MP4 — something a browser can save as-is. */
function isDirectServable(f: RawFormat): boolean {
  return Boolean(
    f.url &&
      f.ext === 'mp4' &&
      f.vcodec &&
      f.vcodec !== 'none' &&
      f.acodec &&
      f.acodec !== 'none' &&
      typeof f.height === 'number' &&
      f.height > 0 &&
      (!f.protocol || f.protocol === 'https' || f.protocol === 'http'),
  );
}

function isH264(f: RawFormat): boolean {
  return Boolean(f.vcodec && /^(avc1|avc3|h264)/i.test(f.vcodec));
}

/**
 * Returns a registered direct-stream entry when the pre-muxed file is at least
 * as good as what the yt-dlp merge pipeline would produce for this request —
 * otherwise null, and the caller falls back to the normal job. Quality is
 * never sacrificed for speed: if merging separate streams would yield a higher
 * resolution (YouTube above 360/720p), we decline the fast path.
 */
export function findDirectStream(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  options?: { ip?: string },
): DirectStreamEntry | null {
  const proxy = currentProxy() ?? '';
  // undici's ProxyAgent speaks http(s) only — a socks pool falls back to yt-dlp.
  if (proxy && !/^https?:\/\//i.test(proxy)) return null;
  if (activeStreams >= maxActiveStreams) return null;

  const infoPath = getFreshInfoJson(url, proxy);
  if (!infoPath) return null;

  let dump: RawDump;
  try {
    dump = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as RawDump;
  } catch {
    return null;
  }
  const formats = dump.formats ?? [];

  // The resolution the merge pipeline would deliver at this quality cap.
  let bestVideoHeight = 0;
  for (const f of formats) {
    if (
      f.vcodec &&
      f.vcodec !== 'none' &&
      typeof f.height === 'number' &&
      f.height > 0 &&
      f.height <= quality.height
    ) {
      bestVideoHeight = Math.max(bestVideoHeight, f.height);
    }
  }
  if (!bestVideoHeight) return null;

  const candidates = formats
    .filter((f) => isDirectServable(f) && (f.height as number) <= quality.height)
    .filter((f) => (mode === 'compatible' ? isH264(f) : true))
    .sort((a, b) => (b.height as number) - (a.height as number) || Number(isH264(b)) - Number(isH264(a)));

  const best = candidates[0];
  if (!best || (best.height as number) < bestVideoHeight) return null;

  const entry: DirectStreamEntry = {
    id: nanoid(),
    mediaUrl: best.url as string,
    proxy,
    headers: best.http_headers ?? {},
    filename: `${safeName(dump.title ?? 'video')} ${best.height}p.mp4`,
    height: best.height as number,
    qualityLabel: quality.label,
    requestedHeight: quality.height,
    platformId: detectPlatform(url)?.id,
    filesize: best.filesize ?? best.filesize_approx ?? null,
    ip: options?.ip,
    createdAt: Date.now(),
  };
  registry.set(entry.id, entry);
  logger.info(
    `Direct stream ${entry.id}: ${entry.platformId ?? 'unknown'} ${entry.height}p pre-muxed (${activeStreams} piping)`,
  );
  return entry;
}

export function getDirectStream(id: string): DirectStreamEntry | undefined {
  const e = registry.get(id);
  if (!e) return undefined;
  if (Date.now() - e.createdAt > REGISTRY_TTL_MS) {
    registry.delete(id);
    return undefined;
  }
  return e;
}

/** Drop an entry whose media URL turned out to be dead (expired/blocked). */
export function dropDirectStream(id: string): void {
  registry.delete(id);
}
