/**
 * ioredis client instances for general caching, pub/sub publishing, and
 * pub/sub subscribing. Separate pub and sub clients are required because
 * a connection in subscriber mode cannot issue regular Redis commands.
 */
import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 1000, 5000),
});

export const pub = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
});

export const sub = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
});

/** Opens all three Redis connections. Called once at server startup. */
export async function connectRedis(): Promise<void> {
  await redis.connect();
  await pub.connect();
  await sub.connect();
}

/** Closes all three Redis connections. Called during graceful shutdown. */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await pub.quit();
  await sub.quit();
}
