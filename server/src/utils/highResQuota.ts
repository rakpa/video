import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import { countHighResDownloadsByIp } from './downloadLogger.js';
import { logger } from './logger.js';

/**
 * Persistent per-IP counter for free 2K/4K downloads (any URL).
 * Railway: reference REDIS_URL / REDIS_PRIVATE_URL from a Redis database.
 */

interface QuotaStore {
  get(key: string): Promise<number>;
  reserve(key: string): Promise<number>;
  rollback(key: string): Promise<void>;
}

type StoreKind = 'redis' | 'upstash' | 'sqlite';

const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let store: QuotaStore | null = null;
let storeKind: StoreKind = 'sqlite';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (redisUrl) {
  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
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

export function isRedisQuotaEnabled(): boolean {
  return store !== null;
}

export function quotaStoreKind(): StoreKind {
  return storeKind;
}

function keyFor(ip: string): string {
  return `highres:count:${ip}`;
}

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

/** Roll back one reserved slot when the download job fails to start. */
export async function rollbackHighResSlot(ip: string | undefined | null): Promise<void> {
  if (!ip || !store) return;
  try {
    await store.rollback(keyFor(ip));
  } catch (err) {
    logger.warn(`Quota rollback failed: ${(err as Error).message}`);
  }
}

/**
 * Atomically consume one free 2K/4K slot for this IP (counts across all URLs).
 * With Redis: INCR then rollback if over limit. Retries on transient errors.
 */
export async function reserveHighResSlot(
  ip: string | undefined | null,
  limit: number,
): Promise<ReserveResult> {
  if (!ip) {
    logger.warn('High-res quota check skipped — could not determine client IP');
    return { allowed: false, used: limit };
  }

  if (store) {
    const key = keyFor(ip);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const after = await store.reserve(key);
        if (after > limit) {
          await store.rollback(key);
          return { allowed: false, used: limit };
        }
        return { allowed: true, used: after };
      } catch (err) {
        if (attempt < 2) {
          await sleep(150 * (attempt + 1));
          continue;
        }
        logger.error(`Quota reserve failed after retries: ${(err as Error).message}`);
        // Fail closed — never fall back to ephemeral sqlite when Redis is configured.
        return { allowed: false, used: limit };
      }
    }
  }

  const used = countHighResDownloadsByIp(ip);
  if (used >= limit) return { allowed: false, used };
  return { allowed: true, used };
}
