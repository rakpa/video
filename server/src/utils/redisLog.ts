import type { Redis as IORedis } from 'ioredis';
import { logger } from './logger.js';

const REPEAT_LOG_MS = 10 * 60_000;

/**
 * Log Redis connection errors once, then at most every 10 minutes, plus a line
 * when the connection recovers. ioredis emits an error on every reconnect
 * attempt, which buried everything else in the Railway logs when the Redis
 * host was missing (ENOTFOUND every ~3s from each client).
 */
export function attachThrottledRedisLogging(client: IORedis, label: string): void {
  let lastLog = 0;
  let suppressed = 0;
  let down = false;
  client.on('error', (err: Error) => {
    const now = Date.now();
    if (!down || now - lastLog >= REPEAT_LOG_MS) {
      const extra = suppressed > 0 ? ` (${suppressed} repeats suppressed)` : '';
      logger.warn(`${label} error: ${err.message}${extra} — falling back until it reconnects`);
      lastLog = now;
      suppressed = 0;
    } else {
      suppressed += 1;
    }
    down = true;
  });
  client.on('ready', () => {
    if (down) logger.info(`${label} reconnected`);
    down = false;
    suppressed = 0;
  });
}

/** Reconnect backoff: quick at first, then settle at 30s while Redis is gone. */
export function redisRetryStrategy(times: number): number {
  return Math.min(times * 500, 30_000);
}
