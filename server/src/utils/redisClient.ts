import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import { logger } from './logger.js';
import { attachThrottledRedisLogging, redisRetryStrategy } from './redisLog.js';

/** Shared Redis for quota, download cache, and (later) BullMQ. */
let client: IORedis | UpstashRedis | null = null;
let mode: 'ioredis' | 'upstash' | null = null;

const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (redisUrl) {
  client = new IORedis(redisUrl, {
    // Fail fast — callers already treat errors as a cache miss, and the
    // download path must never wait on a missing Redis.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 1_500,
    lazyConnect: false,
    connectTimeout: 3_000,
    family: 0,
    retryStrategy: redisRetryStrategy,
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
  });
  attachThrottledRedisLogging(client as IORedis, 'Redis');
  mode = 'ioredis';
} else if (upstashUrl && upstashToken) {
  client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
  mode = 'upstash';
}

/** Command failures while disconnected are already covered by the throttled connection log. */
function warnCommand(op: string, err: unknown): void {
  const msg = (err as Error).message ?? String(err);
  if (/Stream isn't writeable|Connection is closed/i.test(msg)) return;
  logger.warn(`Redis ${op} failed: ${msg}`);
}

export function isRedisAvailable(): boolean {
  return client !== null;
}

export function redisMode(): 'ioredis' | 'upstash' | null {
  return mode;
}

/** Low-level GET — returns null when Redis is not configured or unreachable. */
export async function redisGet(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    if (mode === 'ioredis') return (await (client as IORedis).get(key)) as string | null;
    const v = await (client as UpstashRedis).get<string | null>(key);
    return v ?? null;
  } catch (err) {
    warnCommand('GET', err);
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (!client) return;
  try {
    if (mode === 'ioredis') {
      if (ttlSeconds) await (client as IORedis).set(key, value, 'EX', ttlSeconds);
      else await (client as IORedis).set(key, value);
      return;
    }
    if (ttlSeconds) await (client as UpstashRedis).set(key, value, { ex: ttlSeconds });
    else await (client as UpstashRedis).set(key, value);
  } catch (err) {
    warnCommand('SET', err);
  }
}

export async function redisDel(key: string): Promise<void> {
  if (!client) return;
  try {
    if (mode === 'ioredis') await (client as IORedis).del(key);
    else await (client as UpstashRedis).del(key);
  } catch (err) {
    warnCommand('DEL', err);
  }
}

/** SET key value NX EX ttl — returns true when the lock was acquired. */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (!client) return true;
  try {
    if (mode === 'ioredis') {
      const result = await (client as IORedis).set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
    const result = await (client as UpstashRedis).set(key, value, { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (err) {
    warnCommand('SETNX', err);
    return true;
  }
}
