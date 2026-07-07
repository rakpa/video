import { Redis } from '@upstash/redis';
import { countHighResDownloadsByIp } from './downloadLogger.js';

/**
 * Persistent per-IP counter for free 2K/4K downloads.
 *
 * The local SQLite DB lives on Render's ephemeral free-tier disk, so it is
 * wiped on every restart/redeploy/spin-down — which resets the count. To make
 * the "N free 2K/4K per IP" rule actually stick, we store the counter in
 * Upstash Redis (durable, free tier) when it's configured.
 *
 * If the Upstash env vars are missing (e.g. local dev), we transparently fall
 * back to counting rows in SQLite so behaviour is unchanged.
 */
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

/** True when a durable Redis store is backing the quota (vs ephemeral SQLite). */
export function isRedisQuotaEnabled(): boolean {
  return redis !== null;
}

function keyFor(ip: string): string {
  return `highres:count:${ip}`;
}

/** How many successful 2K/4K downloads this IP has made (durable when Redis is on). */
export async function getHighResCount(ip: string | undefined | null): Promise<number> {
  if (!ip) return 0;
  if (redis) {
    try {
      const val = await redis.get<number | string | null>(keyFor(ip));
      return typeof val === 'number' ? val : Number(val ?? 0) || 0;
    } catch {
      // Redis unavailable → fall back to the (ephemeral) SQLite count.
    }
  }
  return countHighResDownloadsByIp(ip);
}

/**
 * Record one more successful 2K/4K download for this IP. No-op unless Redis is
 * configured (the SQLite count is maintained separately by `logDownload`).
 */
export async function incrementHighResCount(ip: string | undefined | null): Promise<void> {
  if (!ip || !redis) return;
  try {
    await redis.incr(keyFor(ip));
  } catch {
    // Best-effort: a failed increment shouldn't break the download.
  }
}
