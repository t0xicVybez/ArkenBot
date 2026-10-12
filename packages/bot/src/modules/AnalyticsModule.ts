

/**
 * Collects per-guild activity metrics (messages, commands, joins, leaves).
 *
 * Counts are tallied in fast Redis counters keyed by day, then flushed to the
 * database once a day. Keeping the hot counting in Redis avoids a database
 * write on every single message. Powers the `/analytics` dashboard and charts.
 */
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';
import type { BotClient } from '../client.js';

const REDIS_PREFIX = 'analytics';

// Build today's Redis counter key for one guild + metric (e.g. messages).
function dayKey(guildId: string, metric: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${REDIS_PREFIX}:${guildId}:${today}:${metric}`;
}

export class AnalyticsModule {

  static async trackMessage(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'messages'));
  }

  static async trackCommand(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'commands'));
  }

  static async trackJoin(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'joins'));
  }

  static async trackLeave(guildId: string): Promise<void> {
    await redis.incr(dayKey(guildId, 'leaves'));
  }

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
