import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import geoip from 'geoip-lite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file will be created in server/data/downloads.db
const dbDir = path.join(__dirname, '../../data');
const dbPath = path.join(dbDir, 'downloads.db');

// Ensure the data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    platform TEXT NOT NULL,
    quality TEXT NOT NULL,
    output_height INTEGER,
    ip TEXT,
    country TEXT,
    success INTEGER DEFAULT 1
  );
`);

// Migration: add requested_height (the quality tier the user chose) so we can
// count 2K/4K downloads per IP regardless of the delivered height.
const columns = db.prepare('PRAGMA table_info(downloads)').all() as Array<{ name: string }>;
if (!columns.some((c) => c.name === 'requested_height')) {
  db.exec('ALTER TABLE downloads ADD COLUMN requested_height INTEGER');
}
// Bytes actually sent to the user (filled in when the transfer ends).
if (!columns.some((c) => c.name === 'bytes')) {
  db.exec('ALTER TABLE downloads ADD COLUMN bytes INTEGER');
}

// Outcome: 'success' | 'failed' | 'started' (stream still running). NULL = old success rows.
if (!columns.some((c) => c.name === 'status')) {
  db.exec('ALTER TABLE downloads ADD COLUMN status TEXT');
}
if (!columns.some((c) => c.name === 'error')) {
  db.exec('ALTER TABLE downloads ADD COLUMN error TEXT');
}

// The smallest height considered "high resolution" (2K). 2K = 1440, 4K = 2160.
export const HIGH_RES_MIN_HEIGHT = 1440;

// Prepare statements for performance
const insertStmt = db.prepare(`
  INSERT INTO downloads (timestamp, platform, quality, output_height, requested_height, ip, country, success, status, error)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const setStatusStmt = db.prepare('UPDATE downloads SET status = ?, error = ?, success = ? WHERE id = ?');

const countHighResByIpStmt = db.prepare(`
  SELECT COUNT(*) as total FROM downloads
  WHERE success = 1 AND ip = ? AND (requested_height >= ? OR output_height >= ?)
`);

const countAllStmt = db.prepare(
  'SELECT COUNT(*) as total, COALESCE(SUM(bytes), 0) as bytes FROM downloads WHERE success = 1',
);
const countTodayStmt = db.prepare(`
  SELECT COUNT(*) as total, COALESCE(SUM(bytes), 0) as bytes FROM downloads 
  WHERE success = 1 AND timestamp >= ?
`);
const addBytesStmt = db.prepare('UPDATE downloads SET bytes = COALESCE(bytes, 0) + ? WHERE id = ?');

const byPlatformStmt = db.prepare(`
  SELECT platform, COUNT(*) as count, COALESCE(SUM(bytes), 0) as bytes 
  FROM downloads 
  WHERE success = 1 
  GROUP BY platform
`);

const recentStmt = db.prepare(`
  SELECT timestamp, platform, quality, output_height, ip, country, bytes 
  FROM downloads 
  WHERE success = 1 
  ORDER BY timestamp DESC 
  LIMIT ?
`);

export interface DownloadLog {
  platform: string;
  quality: string;
  outputHeight?: number | null;
  /** The quality tier height the user requested (e.g. 1440 or 2160). */
  requestedHeight?: number | null;
  ip?: string;
  /** Known size (finished job files); streams add theirs via addDownloadBytes. */
  bytes?: number | null;
  status?: DownloadStatus;
  error?: string | null;
}

export type DownloadStatus = 'success' | 'failed' | 'started';

/** Log a successful download with automatic country lookup. Returns the row id. */
export function logDownload(log: DownloadLog): number {
  const now = Date.now();
  let country: string | null = null;

  if (log.ip) {
    try {
      const geo = geoip.lookup(log.ip);
      if (geo?.country) {
        country = geo.country;
      }
    } catch {
      // geoip lookup failed, ignore
    }
  }

  const info = insertStmt.run(
    now,
    log.platform,
    log.quality,
    log.outputHeight ?? null,
    log.requestedHeight ?? null,
    log.ip ?? null,
    country,
    log.status === 'failed' ? 0 : 1,
    log.status ?? 'success',
    log.error ? log.error.slice(0, 300) : null,
  );
  const id = Number(info.lastInsertRowid);
  if (log.bytes && log.bytes > 0) addDownloadBytes(id, log.bytes);
  return id;
}

/** Record bytes delivered for a logged download (best effort). */
export function addDownloadBytes(id: number | null | undefined, bytes: number): void {
  if (!id || !(bytes > 0)) return;
  try {
    addBytesStmt.run(Math.round(bytes), id);
  } catch {
    /* stats only */
  }
}

/** Stream tickets → their download log row, so the stream can record its size. */
const ticketLogIds = new Map<string, number>();

export function linkTicketToLog(ticketId: string, logId: number): void {
  ticketLogIds.set(ticketId, logId);
  if (ticketLogIds.size > 5000) ticketLogIds.delete(ticketLogIds.keys().next().value as string);
}

export function addTicketBytes(ticketId: string, bytes: number): void {
  addDownloadBytes(ticketLogIds.get(ticketId), bytes);
}

/** Final outcome of a stream download (failed rows stop counting toward the 2K/4K quota). */
export function setTicketStatus(ticketId: string, status: DownloadStatus, error?: string | null): void {
  const id = ticketLogIds.get(ticketId);
  if (!id) return;
  try {
    setStatusStmt.run(status, error ? error.slice(0, 300) : null, status === 'failed' ? 0 : 1, id);
  } catch {
    /* stats only */
  }
}

/**
 * How many successful 2K/4K downloads this IP has made. Used to enforce the free
 * high-resolution download allowance before requiring Pro.
 */
export function countHighResDownloadsByIp(ip: string | undefined | null): number {
  if (!ip) return 0;
  const row = countHighResByIpStmt.get(ip, HIGH_RES_MIN_HEIGHT, HIGH_RES_MIN_HEIGHT) as {
    total: number;
  };
  return row?.total ?? 0;
}

/** Get basic stats for admin */
export function getDownloadStats() {
  const total = countAllStmt.get() as { total: number; bytes: number };
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = countTodayStmt.get(todayStart.getTime()) as { total: number; bytes: number };

  const byPlatform = byPlatformStmt.all() as Array<{ platform: string; count: number; bytes: number }>;

  const recent = recentStmt.all(50) as Array<{
    timestamp: number;
    platform: string;
    quality: string;
    output_height: number | null;
    ip: string | null;
    country: string | null;
    bytes: number | null;
  }>;

  return {
    totalDownloads: total.total,
    todayDownloads: today.total,
    totalBytes: total.bytes,
    todayBytes: today.bytes,
    bytesByPlatform: byPlatform.reduce((acc, row) => {
      acc[row.platform] = row.bytes;
      return acc;
    }, {} as Record<string, number>),
    byPlatform: byPlatform.reduce((acc, row) => {
      acc[row.platform] = row.count;
      return acc;
    }, {} as Record<string, number>),
    recentDownloads: recent.map(r => ({
      time: new Date(r.timestamp).toISOString(),
      platform: r.platform,
      quality: r.quality,
      height: r.output_height,
      ip: r.ip,
      country: r.country,
      bytes: r.bytes,
    })),
  };
}

const rangeRowsStmt = db.prepare(`
  SELECT timestamp, platform, quality, output_height, requested_height, ip, country, bytes,
         COALESCE(status, 'success') as status, error
  FROM downloads
  WHERE timestamp >= ? AND timestamp < ?
  ORDER BY timestamp DESC
  LIMIT ?
`);
const rangeTotalsStmt = db.prepare(`
  SELECT platform, COUNT(*) as count, COALESCE(SUM(bytes), 0) as bytes
  FROM downloads
  WHERE COALESCE(status, 'success') != 'failed' AND timestamp >= ? AND timestamp < ?
  GROUP BY platform
`);
const rangeFailedStmt = db.prepare(`
  SELECT COUNT(*) as count FROM downloads
  WHERE status = 'failed' AND timestamp >= ? AND timestamp < ?
`);

export interface DownloadRow {
  timestamp: number;
  platform: string;
  quality: string;
  output_height: number | null;
  requested_height: number | null;
  ip: string | null;
  country: string | null;
  bytes: number | null;
  status: DownloadStatus;
  error: string | null;
}

/** Every download in [fromMs, toMs) plus per-platform totals, for the admin page. */
export function getDownloadsInRange(fromMs: number, toMs: number, limit = 10000) {
  const rows = rangeRowsStmt.all(fromMs, toMs, limit) as DownloadRow[];
  const platforms = rangeTotalsStmt.all(fromMs, toMs) as Array<{ platform: string; count: number; bytes: number }>;
  const failed = (rangeFailedStmt.get(fromMs, toMs) as { count: number }).count;
  return {
    rows,
    platforms,
    failed,
    count: platforms.reduce((s, p) => s + p.count, 0),
    bytes: platforms.reduce((s, p) => s + p.bytes, 0),
  };
}
