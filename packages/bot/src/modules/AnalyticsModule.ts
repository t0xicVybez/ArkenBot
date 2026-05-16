/**
 * Tracks per-guild daily activity metrics in Redis and flushes them to the
 * `ServerDailyStats` database table once per day. Using Redis counters avoids
 * a database write on every message and command interaction.
 */

import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';
import type { BotClient } from '../client.js';

const REDIS_PREFIX = 'analytics';

/**
 * Returns the Redis key for a per-guild, per-metric daily counter.
 * Keys are scoped to the current UTC date so they naturally roll over at midnight.
 */
function dayKey(guildId: string, metric: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${REDIS_PREFIX}:${guildId}:${today}:${metric}`;
}

export class AnalyticsModule {
  /** Increments the message counter for the guild. Call on every `messageCreate` event. */
  static async trackMessage(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'messages'));
  }

  /** Increments the command counter for the guild. Call on every handled `interactionCreate`. */
  static async trackCommand(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'commands'));
  }

  /** Increments the member-join counter for the guild. */
  static async trackJoin(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'joins'));
  }

  /** Increments the member-leave counter for the guild. */
  static async trackLeave(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'leaves'));
  }

  /**
   * Persists yesterday's Redis counters to `ServerDailyStats` and deletes the
   * corresponding Redis keys. Guilds with zero activity across all metrics are
   * skipped to avoid creating empty database rows. Called once per day by
   * `BackgroundJobs`.
   */
  static async flushDailyStats(client: BotClient): Promise<void> {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const dateTs = new Date(`${dateStr}T00:00:00Z`);

    try {
      for (const guild of client.guilds.cache.values()) {
        const messages = parseInt(await redis.get(`${REDIS_PREFIX}:${guild.id}:${dateStr}:messages`) ?? '0', 10);
        const commands = parseInt(await redis.get(`${REDIS_PREFIX}:${guild.id}:${dateStr}:commands`) ?? '0', 10);
        const joins    = parseInt(await redis.get(`${REDIS_PREFIX}:${guild.id}:${dateStr}:joins`)    ?? '0', 10);
        const leaves   = parseInt(await redis.get(`${REDIS_PREFIX}:${guild.id}:${dateStr}:leaves`)   ?? '0', 10);

        if (messages === 0 && commands === 0 && joins === 0 && leaves === 0) continue;

        await prisma.serverDailyStats.upsert({
          where: { guildId_date: { guildId: guild.id, date: dateTs } },
          update: {
            memberCount:   guild.memberCount,
            messagesCount: messages,
            commandsCount: commands,
            newMembers:    joins,
            leftMembers:   leaves,
          },
          create: {
            guildId:       guild.id,
            date:          dateTs,
            memberCount:   guild.memberCount,
            messagesCount: messages,
            commandsCount: commands,
            newMembers:    joins,
            leftMembers:   leaves,
          },
        });

        await redis.del(
          `${REDIS_PREFIX}:${guild.id}:${dateStr}:messages`,
          `${REDIS_PREFIX}:${guild.id}:${dateStr}:commands`,
          `${REDIS_PREFIX}:${guild.id}:${dateStr}:joins`,
          `${REDIS_PREFIX}:${guild.id}:${dateStr}:leaves`,
        );

        logger.debug({ guildId: guild.id, date: dateStr, messages, commands, joins, leaves }, 'Analytics flushed');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to flush daily analytics');
    }
  }
}
