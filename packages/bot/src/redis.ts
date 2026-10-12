

import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
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
