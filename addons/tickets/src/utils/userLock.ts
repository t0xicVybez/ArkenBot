/**
 * A short Redis lock per (guild, member), so two ticket-open attempts from the
 * same person can't both pass the open-limit check before either one exists.
 * Best-effort like the storage lock: if the lock can't be taken within the
 * wait window, the work proceeds rather than leaving the member hanging.
 */
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';

const RELEASE_LOCK = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const LOCK_TTL_MS = 15_000;
const MAX_WAIT_MS = 10_000;

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
    });
    client.on('error', () => undefined);
  }
  return client;
}

export async function withUserLock<T>(guildId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  const redis = getClient();
  const key = `tickets:open-lock:${guildId}:${userId}`;
  const token = randomUUID();
  const deadline = Date.now() + MAX_WAIT_MS;
  let acquired = false;
  for (;;) {
    const ok = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX').catch(() => null);
    if (ok === 'OK') { acquired = true; break; }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 50)));
  }
  try {
    return await fn();
  } finally {
    if (acquired) await redis.eval(RELEASE_LOCK, 1, key, token).catch(() => undefined);
  }
}
