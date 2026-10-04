/**
 * guildChannelDelete event — tracks channel deletions for anti-nuke protection.
 */
import { Events, AuditLogEvent, type GuildChannel } from 'discord.js';
import type { BotEvent } from '../types.js';
import { AntiNukeModule } from '../modules/antiNuke/AntiNukeModule.js';
import { logger } from '../logger.js';
import { isPermissionError } from '../utils/permissionAlert.js';

const event: BotEvent = {
  name: Events.ChannelDelete,
  async execute(_client: unknown, channel: GuildChannel) {
    if (!channel.guild) return;
    const guild = channel.guild;
    try {
      const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
      const entry = auditLogs.entries.first();
      if (entry?.executor) {
        await AntiNukeModule.trackAction(guild, entry.executor.id, 'channelDelete');
      }
    } catch (err) {
      // A 403 just means the bot lacks View Audit Log here — anti-nuke tracking
      // no-ops, no admin action needed. Only surface genuinely unexpected errors.
      if (isPermissionError(err)) {
        logger.debug({ err, guildId: guild.id }, 'guildChannelDelete: no audit-log access');
      } else {
        logger.error({ err, guildId: guild.id }, 'guildChannelDelete anti-nuke error');
      }
    }
  },
};

export default event;
