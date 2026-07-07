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

// The smallest height considered "high resolution" (2K). 2K = 1440, 4K = 2160.
export const HIGH_RES_MIN_HEIGHT = 1440;

// Prepare statements for performance
const insertStmt = db.prepare(`
  INSERT INTO downloads (timestamp, platform, quality, output_height, requested_height, ip, country, success)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const countHighResByIpStmt = db.prepare(`
  SELECT COUNT(*) as total FROM downloads
  WHERE success = 1 AND ip = ? AND (requested_height >= ? OR output_height >= ?)
`);

const countAllStmt = db.prepare('SELECT COUNT(*) as total FROM downloads WHERE success = 1');
const countTodayStmt = db.prepare(`
  SELECT COUNT(*) as total FROM downloads 
  WHERE success = 1 AND timestamp >= ?
`);

const byPlatformStmt = db.prepare(`
  SELECT platform, COUNT(*) as count 
  FROM downloads 
  WHERE success = 1 
  GROUP BY platform
`);

const recentStmt = db.prepare(`
  SELECT timestamp, platform, quality, output_height, ip, country 
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
}

/** Log a successful download with automatic country lookup */
export function logDownload(log: DownloadLog) {
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

  insertStmt.run(
    now,
    log.platform,
    log.quality,
    log.outputHeight ?? null,
    log.requestedHeight ?? null,
    log.ip ?? null,
    country,
    1
  );
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
  const total = countAllStmt.get() as { total: number };
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = countTodayStmt.get(todayStart.getTime()) as { total: number };

  const byPlatform = byPlatformStmt.all() as Array<{ platform: string; count: number }>;

  const recent = recentStmt.all(50) as Array<{
    timestamp: number;
    platform: string;
    quality: string;
    output_height: number | null;
    ip: string | null;
    country: string | null;
  }>;

  return {
    totalDownloads: total.total,
    todayDownloads: today.total,
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
    })),
  };
}
