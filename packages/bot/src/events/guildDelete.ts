/**
 * guildDelete event — runs when the bot leaves or is removed from a guild.
 * Marks the guild as inactive, purges configuration data, and publishes a
 * leave event. Audit data (moderation cases, warnings, user levels) is retained.
 */
import type { Guild } from 'discord.js';
import type { BotEvent } from '../types.js';
import { prisma } from '../database.js';
import { logger } from '../logger.js';
import { pub } from '../redis.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

const event: BotEvent = {
  name: 'guildDelete',
  async execute(_client: unknown, guild: Guild) {
    logger.info(`Left guild: ${guild.name} (${guild.id})`);

    // Evict from the in-process invite cache immediately so the Map doesn't
    // retain stale data for guilds the bot has permanently left.
    InviteTrackerModule.clearGuild(guild.id);

    await Promise.allSettled([
      prisma.guild.update({
        where: { id: guild.id },
        data: { isActive: false, leftAt: new Date() },
      }),
      prisma.guildSettings.deleteMany({ where: { guildId: guild.id } }),
      prisma.welcomeConfig.deleteMany({ where: { guildId: guild.id } }),
      prisma.autoModConfig.deleteMany({ where: { guildId: guild.id } }),
      prisma.musicQueue.deleteMany({ where: { guildId: guild.id } }),
      prisma.guildAddon.deleteMany({ where: { guildId: guild.id } }),
      prisma.addonData.deleteMany({ where: { guildId: guild.id } }),
      prisma.reactionRole.deleteMany({ where: { guildId: guild.id } }),
      prisma.customCommand.deleteMany({ where: { guildId: guild.id } }),
    ]);

    logger.info(`Wiped settings for guild ${guild.id}`);

    await pub.publish('bot:events', JSON.stringify({
      type: 'guild:left',
      data: { guildId: guild.id },
    }));
  },
};

export default event;
