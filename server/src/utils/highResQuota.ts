import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import { countHighResDownloadsByIp } from './downloadLogger.js';
import { logger } from './logger.js';

/**
 * Persistent per-IP counter for free 2K/4K downloads (any URL).
 * Railway: add a Variable Reference on the API service → Redis → REDIS_URL
 * (internal redis.railway.internal). Do NOT paste REDIS_PUBLIC_URL into the API.
 */

interface QuotaStore {
  get(key: string): Promise<number>;
  /** Atomically reserve one slot; returns new count, or 0 when at/over limit. */
  reserve(key: string, limit: number): Promise<number>;
  rollback(key: string): Promise<void>;
}

type StoreKind = 'redis' | 'upstash' | 'sqlite';

const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let store: QuotaStore | null = null;
let storeKind: StoreKind = 'sqlite';
let redisClient: IORedis | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safe host label for logs — never log credentials. */
function redisHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid REDIS_URL)';
  }
}

function isWrongTypeError(err: unknown): boolean {
  return err instanceof Error && /WRONGTYPE/i.test(err.message);
}

/** EVAL rejected by the server (scripting disabled/unsupported), not a connectivity failure. */
function isScriptUnsupportedError(err: unknown): boolean {
  return err instanceof Error && /unknown command|NOSCRIPT|scripting|not allowed|NOPERM/i.test(err.message);
}

/**
 * INCR with recovery when a key was accidentally written as a non-integer type.
 * Returns the value after increment, or throws on unrecoverable errors.
 */
async function redisIncr(client: IORedis, key: string): Promise<number> {
  try {
    return await client.incr(key);
  } catch (err) {
    if (isWrongTypeError(err)) {
      logger.warn(`Quota Redis key ${key} had wrong type — deleting and retrying INCR`);
      await client.del(key);
      return await client.incr(key);
    }
    throw err;
  }
}

/** Atomic reserve: increment only when below limit; returns 0 when full. */
const RESERVE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if current >= limit then
  return 0
end
return redis.call('INCR', KEYS[1])
`;

if (redisUrl) {
  redisClient = new IORedis(redisUrl, {
    // Fail fast: the quota check sits in front of every 2K/4K download, and a
    // down Redis used to stall each request ~70s (3 reserve attempts × 3 ioredis
    // retries × 10s connect) before the SQLite fallback kicked in.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 1_500,
    lazyConnect: false,
    connectTimeout: 3_000,
    // Railway private networking can be IPv4 or IPv6.
    family: 0,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
  });
  redisClient.on('error', (err: Error) => logger.warn(`Quota Redis error: ${err.message}`));

  const client = redisClient;
  store = {
    async get(key) {
      const v = await client.get(key);
      return Number(v ?? 0) || 0;
    },
    async reserve(key, limit) {
      try {
        const result = await client.eval(RESERVE_LUA, 1, key, String(limit));
        return Number(result) || 0;
      } catch (err) {
        if (isWrongTypeError(err)) {
          logger.warn(`Quota Redis key ${key} had wrong type — deleting and retrying reserve`);
          await client.del(key);
          const result = await client.eval(RESERVE_LUA, 1, key, String(limit));
          return Number(result) || 0;
        }
        // Connection/timeout errors: don't pay a second round-trip — let the
        // caller fall back to SQLite.
        if (!isScriptUnsupportedError(err)) throw err;
        // Lua unavailable on some managed Redis tiers — fall back to INCR + rollback.
        const after = await redisIncr(client, key);
        if (after > limit) {
          await client.decr(key);
          return 0;
        }
        return after;
      }
    },
    async rollback(key) {
      const v = await client.decr(key);
      if (v < 0) await client.set(key, '0');
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
    async reserve(key, limit) {
      const current = Number((await client.get(key)) ?? 0) || 0;
      if (current >= limit) return 0;
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

async function sqliteCount(ip: string): Promise<number> {
  return countHighResDownloadsByIp(ip);
}

/** Highest known usage for this IP across Redis and the local download log. */
export async function getHighResCount(ip: string | undefined | null): Promise<number> {
  if (!ip) return 0;

  let redisCount = 0;
  if (store) {
    try {
      redisCount = await store.get(keyFor(ip));
    } catch (err) {
      logger.warn(`Quota read failed, falling back to SQLite: ${(err as Error).message}`);
    }
  }

  const sqlite = await sqliteCount(ip);
  return Math.max(redisCount, sqlite);
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

function sqliteReserve(ip: string, limit: number): ReserveResult {
  const used = countHighResDownloadsByIp(ip);
  if (used >= limit) return { allowed: false, used };
  return { allowed: true, used: used + 1 };
}

/**
 * Atomically consume one free 2K/4K slot for this IP (counts across all URLs).
 * With Redis: Lua INCR-or-reject. On persistent Redis errors, falls back to SQLite
 * instead of blocking every visitor (the previous fail-closed path caused "0/5
 * remaining" on GET but 402 on every POST).
 */
export async function reserveHighResSlot(
  ip: string | undefined | null,
  limit: number,
): Promise<ReserveResult> {
  if (!ip) {
    logger.warn('High-res quota check skipped — could not determine client IP');
    return { allowed: false, used: limit };
  }

  if (limit <= 0) {
    return { allowed: false, used: 0 };
  }

  if (store) {
    const key = keyFor(ip);
    const attempts = 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const after = await store.reserve(key, limit);
        if (after <= 0) {
          const used = await getHighResCount(ip);
          return { allowed: false, used: Math.max(used, limit) };
        }
        return { allowed: true, used: after };
      } catch (err) {
        if (attempt < attempts - 1) {
          await sleep(200);
          continue;
        }
        logger.error(
          `Quota reserve failed after retries (${(err as Error).message}) — falling back to SQLite`,
        );
      }
    }
  }

  return sqliteReserve(ip, limit);
}

export type QuotaHealth = {
  store: StoreKind;
  redisConfigured: boolean;
  redisHost: string | null;
  redisOk: boolean | null;
  message: string | null;
};

let lastQuotaHealth: QuotaHealth = {
  store: storeKind,
  redisConfigured: Boolean(redisUrl),
  redisHost: redisUrl ? redisHostLabel(redisUrl) : null,
  redisOk: null,
  message: null,
};

export function getQuotaHealth(): QuotaHealth {
  return lastQuotaHealth;
}

/** Ping Redis at startup so misconfigured REDIS_URL shows up in deploy logs immediately. */
export async function logQuotaStoreStatus(): Promise<void> {
  if (!redisUrl && !(upstashUrl && upstashToken)) {
    lastQuotaHealth = {
      store: 'sqlite',
      redisConfigured: false,
      redisHost: null,
      redisOk: null,
      message: 'No Redis — 2K/4K quota resets on every deploy (SQLite only)',
    };
    logger.warn(lastQuotaHealth.message);
    return;
  }

  if (storeKind === 'redis' && redisClient) {
    const host = redisHostLabel(redisUrl!);
    try {
      await redisClient.ping();
      const probeKey = 'highres:__startup_probe__';
      const n = await redisIncr(redisClient, probeKey);
      await redisClient.decr(probeKey);
      lastQuotaHealth = {
        store: 'redis',
        redisConfigured: true,
        redisHost: host,
        redisOk: true,
        message: null,
      };
      logger.info(`Quota Redis OK (${host}, probe incr=${n})`);
    } catch (err) {
      const msg = (err as Error).message;
      lastQuotaHealth = {
        store: 'redis',
        redisConfigured: true,
        redisHost: host,
        redisOk: false,
        message: msg,
      };
      logger.error(
        `Quota Redis FAILED (${host}): ${msg}. ` +
          'On Railway: API service → Variables → add Reference → Redis → REDIS_URL (internal). ' +
          'Reserve will fall back to SQLite until Redis is fixed.',
      );
    }
    return;
  }

  lastQuotaHealth = {
    store: storeKind,
    redisConfigured: true,
    redisHost: upstashUrl ? redisHostLabel(upstashUrl) : null,
    redisOk: true,
    message: null,
  };
  logger.info(`Quota store: ${storeKind}`);
}
