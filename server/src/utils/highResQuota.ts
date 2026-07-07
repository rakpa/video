import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import { countHighResDownloadsByIp } from './downloadLogger.js';
import { logger } from './logger.js';

/**
 * Persistent per-IP counter for free 2K/4K downloads.
 *
 * The local SQLite DB lives on Render's ephemeral free-tier disk, so it is
 * wiped on every restart/redeploy/spin-down (a 4K download can OOM-restart the
 * process) — which resets the count and lets the limit never trigger. To make
 * the "N free 2K/4K per IP" rule actually stick, the count is kept in an
 * external store that survives web-service restarts:
 *
 *   1. Render Key Value (or any Redis) via REDIS_URL  ← no third-party signup
 *   2. Upstash Redis via UPSTASH_REDIS_REST_URL/TOKEN  ← REST, also free
 *
 * If neither is configured (e.g. local dev) we transparently fall back to the
 * SQLite row count so behaviour is unchanged.
 */

interface QuotaStore {
  get(key: string): Promise<number>;
  incr(key: string): Promise<void>;
}

type StoreKind = 'redis' | 'upstash' | 'sqlite';

const redisUrl = process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let store: QuotaStore | null = null;
let storeKind: StoreKind = 'sqlite';

if (redisUrl) {
  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: 2,
    // Render Key Value uses TLS on rediss:// URLs; ioredis handles this via the URL.
    lazyConnect: false,
  });
  client.on('error', (err: Error) => logger.warn(`Quota Redis error: ${err.message}`));
  store = {
    async get(key) {
      const v = await client.get(key);
      return Number(v ?? 0) || 0;
    },
    async incr(key) {
      await client.incr(key);
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
    async incr(key) {
      await client.incr(key);
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

/** How many successful 2K/4K downloads this IP has made (durable when a store is on). */
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

/**
 * Record one more successful 2K/4K download for this IP. No-op unless a durable
 * store is configured (the SQLite count is maintained separately by `logDownload`).
 */
export async function incrementHighResCount(ip: string | undefined | null): Promise<void> {
  if (!ip || !store) return;
  try {
    await store.incr(keyFor(ip));
  } catch (err) {
    logger.warn(`Quota increment failed: ${(err as Error).message}`);
  }
}
