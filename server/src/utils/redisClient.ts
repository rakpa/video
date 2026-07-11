import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import { logger } from './logger.js';

/** Shared Redis for quota, download cache, and (later) BullMQ. */
let client: IORedis | UpstashRedis | null = null;
let mode: 'ioredis' | 'upstash' | null = null;

const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (redisUrl) {
  client = new IORedis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    connectTimeout: 10_000,
    family: 0,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
  });
  (client as IORedis).on('error', (err: Error) => logger.warn(`Redis error: ${err.message}`));
  mode = 'ioredis';
} else if (upstashUrl && upstashToken) {
  client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
  mode = 'upstash';
}

export function isRedisAvailable(): boolean {
  return client !== null;
}

export function redisMode(): 'ioredis' | 'upstash' | null {
  return mode;
}

/** Low-level GET — returns null when Redis is not configured. */
export async function redisGet(key: string): Promise<string | null> {
  if (!client) return null;
  if (mode === 'ioredis') return (await (client as IORedis).get(key)) as string | null;
  const v = await (client as UpstashRedis).get<string | null>(key);
  return v ?? null;
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (!client) return;
  if (mode === 'ioredis') {
    if (ttlSeconds) await (client as IORedis).set(key, value, 'EX', ttlSeconds);
    else await (client as IORedis).set(key, value);
    return;
  }
  if (ttlSeconds) await (client as UpstashRedis).set(key, value, { ex: ttlSeconds });
  else await (client as UpstashRedis).set(key, value);
}

export async function redisDel(key: string): Promise<void> {
  if (!client) return;
  if (mode === 'ioredis') await (client as IORedis).del(key);
  else await (client as UpstashRedis).del(key);
}

/** SET key value NX EX ttl — returns true when the lock was acquired. */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (!client) return true;
  if (mode === 'ioredis') {
    const result = await (client as IORedis).set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
  const result = await (client as UpstashRedis).set(key, value, { nx: true, ex: ttlSeconds });
  return result === 'OK';
}
