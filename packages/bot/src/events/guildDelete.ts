/**
 * guildDelete event — runs when the bot leaves or is removed from a guild.
 * Marks the guild inactive and records leftAt; the actual data purge happens
 * PURGE_GRACE_HOURS later via the BackgroundJobs sweep, so an accidental kick
 * can be undone by re-inviting the bot within the grace window.
 */
import type { Guild } from 'discord.js';
import type { BotEvent } from '../types.js';
import { prisma } from '../database.js';
import { logger } from '../logger.js';
import { pub } from '../redis.js';
import { invalidateSettingsCache } from '../utils/settings.js';
import { PURGE_GRACE_HOURS } from '../utils/guildPurge.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

const event: BotEvent = {
  name: 'guildDelete',
  async execute(_client: unknown, guild: Guild) {
    logger.info(`Left guild: ${guild.name} (${guild.id}) — data purge scheduled in ${PURGE_GRACE_HOURS}h unless re-added`);

    // Evict from the in-process invite cache immediately so the Map doesn't
    // retain stale data for guilds the bot has permanently left.
    InviteTrackerModule.clearGuild(guild.id);
    await invalidateSettingsCache(guild.id).catch(() => undefined);

    await prisma.guild.updateMany({
      where: { id: guild.id },
      data: { isActive: false, leftAt: new Date() },
    }).catch((err) => logger.error({ err, guildId: guild.id }, 'Failed to mark guild as left'));

    await pub.publish('bot:events', JSON.stringify({
      type: 'guild:left',
      data: { guildId: guild.id },
    }));
  },
};

export default event;
