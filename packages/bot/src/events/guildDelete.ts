/**
 * guildDelete event — runs when the bot leaves or is removed from a guild.
 * Purges ALL data associated with the guild: deleting the Guild row cascades
 * to every FK-linked model (settings, levels, warnings, cases, alerts,
 * integrations, …); the handful of models that store guildId without a
 * foreign key are cleared explicitly.
 */
import type { Guild } from 'discord.js';
import type { BotEvent } from '../types.js';
import { prisma } from '../database.js';
import { logger } from '../logger.js';
import { pub } from '../redis.js';
import { invalidateSettingsCache } from '../utils/settings.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

const event: BotEvent = {
  name: 'guildDelete',
  async execute(_client: unknown, guild: Guild) {
    logger.info(`Left guild: ${guild.name} (${guild.id})`);

    // Evict from the in-process invite cache immediately so the Map doesn't
    // retain stale data for guilds the bot has permanently left.
    InviteTrackerModule.clearGuild(guild.id);
    await invalidateSettingsCache(guild.id).catch(() => undefined);

    const results = await Promise.allSettled([
      // Cascades to every model with a Guild foreign key.
      prisma.guild.deleteMany({ where: { id: guild.id } }),
      // These models store guildId as a plain column (no FK), so the
      // cascade above cannot reach them.
      prisma.addonData.deleteMany({ where: { guildId: guild.id } }),
      prisma.userAchievement.deleteMany({ where: { guildId: guild.id } }),
      prisma.serverDailyStats.deleteMany({ where: { guildId: guild.id } }),
      prisma.reputation.deleteMany({ where: { guildId: guild.id } }),
      prisma.starboardEntry.deleteMany({ where: { guildId: guild.id } }),
      prisma.suggestion.deleteMany({ where: { guildId: guild.id } }),
    ]);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      logger.error({ guildId: guild.id, failures: failed.map((f) => String((f as PromiseRejectedResult).reason)) }, 'Guild purge completed with errors');
    } else {
      logger.info(`Purged all data for guild ${guild.id}`);
    }

    await pub.publish('bot:events', JSON.stringify({
      type: 'guild:left',
      data: { guildId: guild.id },
    }));
  },
};

export default event;
