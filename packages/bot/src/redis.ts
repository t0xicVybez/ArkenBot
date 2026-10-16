/**
 * Redis connections.
 *
 * We keep three separate clients because Redis pub/sub is modal — a connection
 * in "subscriber" mode can't run normal commands:
 *   - `redis` — general use (caching, cooldowns, locks, counters)
 *   - `pub`   — publishing messages on channels (e.g. telling the bot to act on
 *               a dashboard change)
 *   - `sub`   — subscribing to those channels
 *
 * All three connect lazily, so importing this file doesn't open a socket until
 * `connectRedis()` runs at startup.
 */
import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  // Back off a little more on each retry, capped at 5s, instead of hammering.
  retryStrategy: (times) => Math.min(times * 1000, 5000),
});

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.info('Redis connected'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));

export const pub = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
});

export const sub = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
});

// The pub/sub clients need their own 'error' listeners too — without them a
// Redis blip emits an unhandled 'error' event and logs noisy ioredis warnings.
// ioredis reconnects on its own.
pub.on('error', (err) => logger.warn({ err, client: 'pub' }, 'Redis pub error (will retry)'));
sub.on('error', (err) => logger.warn({ err, client: 'sub' }, 'Redis sub error (will retry)'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
  await pub.connect();
  await sub.connect();
  logger.info('Redis connected');
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await pub.quit();
  await sub.quit();
}
