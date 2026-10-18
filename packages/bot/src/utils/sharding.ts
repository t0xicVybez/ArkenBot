/**
 * Sharding helpers for background jobs.
 *
 * Most scheduled jobs are guild-scoped and guard with `guilds.cache.get()`, so
 * only the shard that owns a guild acts on it. But a few jobs are *global* —
 * they post the whole bot's server count, DM users from a fleet-wide queue, or
 * sweep DB rows regardless of guild. Those must run on exactly ONE shard, or
 * they'll double-fire (double DMs, wrong top.gg count, repeated purges).
 */
import type { BotClient } from '../client.js';

/**
 * True when this process should run fleet-global work. Unsharded → always.
 * Sharded → only the process that owns shard 0 leads.
 */
export function isLeaderShard(client: BotClient): boolean {
  return !client.shard || client.shard.ids.includes(0);
}

/**
 * The bot's total guild count across every shard. Unsharded → the local cache
 * size. Sharded → sums each shard's cache size via the ShardingManager.
 */
export async function totalGuildCount(client: BotClient): Promise<number> {
  if (!client.shard) return client.guilds.cache.size;
  try {
    const counts = (await client.shard.fetchClientValues('guilds.cache.size')) as number[];
    return counts.reduce((sum, n) => sum + (n ?? 0), 0);
  } catch {
    return client.guilds.cache.size;
  }
}
