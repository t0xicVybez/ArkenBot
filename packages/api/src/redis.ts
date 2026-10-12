/**
 * Redis connections for the API: a general client plus publish/subscribe clients. Publishing here is how the API asks the bot to act (the bot listens in its ready.ts bridge).
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

export async function connectRedis(): Promise<void> {
  await redis.connect();
  await pub.connect();
  await sub.connect();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await pub.quit();
  await sub.quit();
}
