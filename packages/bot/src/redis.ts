/**
 * Exports three ioredis client instances — a general-purpose client (`redis`),
 * a publish-only client (`pub`), and a subscribe-only client (`sub`) — along
 * with connection lifecycle helpers used during startup and shutdown.
 *
 * Separating pub/sub clients from the general-purpose client is required by the
 * Redis protocol: a connection in subscribe mode cannot issue regular commands.
 */

import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

/** General-purpose Redis client used for caching, rate limiting, and analytics. */
export const redis = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 1000, 5000),
});

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.info('Redis connected'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));

/** Dedicated publish client for broadcasting events to the dashboard. */
export const pub = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
});

/** Dedicated subscribe client for receiving events from external services. */
export const sub = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
});

/** Connects all three Redis clients. Must be called before any Redis operations. */
export async function connectRedis(): Promise<void> {
  await redis.connect();
  await pub.connect();
  await sub.connect();
  logger.info('Redis connected');
}

/** Gracefully closes all three Redis connections. */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await pub.quit();
  await sub.quit();
}
