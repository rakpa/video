import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import { countHighResDownloadsByIp } from './downloadLogger.js';
import { logger } from './logger.js';

/**
 * Persistent per-IP counter for free 2K/4K downloads.
 *
 * SQLite on the local disk is wiped on every Railway restart, so the limit
 * never sticks unless Redis is configured. Railway: add a Redis database in
 * your project and reference REDIS_URL (or REDIS_PRIVATE_URL) on the API service.
 */

interface QuotaStore {
  get(key: string): Promise<number>;
  reserve(key: string): Promise<number>;
  rollback(key: string): Promise<void>;
}

type StoreKind = 'redis' | 'upstash' | 'sqlite';

// Railway Redis: prefer private URL (same project network), then public URL.
const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let store: QuotaStore | null = null;
let storeKind: StoreKind = 'sqlite';

if (redisUrl) {
  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  client.on('error', (err: Error) => logger.warn(`Quota Redis error: ${err.message}`));
  store = {
    async get(key) {
      const v = await client.get(key);
      return Number(v ?? 0) || 0;
    },
    async reserve(key) {
      return await client.incr(key);
    },
    async rollback(key) {
      await client.decr(key);
    },
  };
  storeKind = 'redis';
} else if (upstashUrl && upstashToken) {
  const client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
  store = {
    async get(key) {
      const v = await client.get<number | string | null>(key);
      return typeof v === 'number' ? v : Number(v ?? 0) || 0;
    },
    async reserve(key) {
      return await client.incr(key);
    },
    async rollback(key) {
      await client.decr(key);
    },
  };
  storeKind = 'upstash';
}

/** True when a durable external store is backing the quota (vs ephemeral SQLite). */
export function isRedisQuotaEnabled(): boolean {
  return store !== null;
}

/** Which backend is active — surfaced by the quota endpoint for diagnostics. */
export function quotaStoreKind(): StoreKind {
  return storeKind;
}

function keyFor(ip: string): string {
  return `highres:count:${ip}`;
}

/** How many 2K/4K downloads this IP has used. */
export async function getHighResCount(ip: string | undefined | null): Promise<number> {
  if (!ip) return 0;
  if (store) {
    try {
      return await store.get(keyFor(ip));
    } catch (err) {
      logger.warn(`Quota read failed, falling back to SQLite: ${(err as Error).message}`);
    }
  }
  return countHighResDownloadsByIp(ip);
}

export interface ReserveResult {
  allowed: boolean;
  used: number;
}

/**
 * Atomically try to consume one free 2K/4K slot for this IP.
 * With Redis: INCR then rollback if over limit.
 */
export async function reserveHighResSlot(
  ip: string | undefined | null,
  limit: number,
): Promise<ReserveResult> {
  if (!ip) return { allowed: true, used: 0 };

  if (store) {
    try {
      const key = keyFor(ip);
      const after = await store.reserve(key);
      if (after > limit) {
        await store.rollback(key);
        return { allowed: false, used: limit };
      }
      return { allowed: true, used: after };
    } catch (err) {
      logger.warn(`Quota reserve failed, falling back to SQLite: ${(err as Error).message}`);
    }
  }

  const used = countHighResDownloadsByIp(ip);
  if (used >= limit) return { allowed: false, used };
  return { allowed: true, used };
}

/** SQLite-only: count is updated via logDownload on job success. */
export async function incrementHighResCount(ip: string | undefined | null): Promise<void> {
  if (!ip || store) return;
}
