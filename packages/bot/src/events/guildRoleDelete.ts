/**
 * guildRoleDelete event — tracks role deletions for anti-nuke protection.
 */
import { Events, AuditLogEvent, type Role } from 'discord.js';
import type { BotEvent } from '../types.js';
import { AntiNukeModule } from '../modules/antiNuke/AntiNukeModule.js';
import { logger } from '../logger.js';
import { isPermissionError } from '../utils/permissionAlert.js';

const event: BotEvent = {
  name: Events.GuildRoleDelete,
  async execute(_client: unknown, role: Role) {
    const guild = role.guild;
    try {
      const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
      const entry = auditLogs.entries.first();
      if (entry?.executor) {
        await AntiNukeModule.trackAction(guild, entry.executor.id, 'roleDelete');
      }
    } catch (err) {
      // A 403 just means the bot lacks View Audit Log here — anti-nuke tracking
      // no-ops, no admin action needed. Only surface genuinely unexpected errors.
      if (isPermissionError(err)) {
        logger.debug({ err, guildId: guild.id }, 'guildRoleDelete: no audit-log access');
      } else {
        logger.error({ err, guildId: guild.id }, 'guildRoleDelete anti-nuke error');
      }
    }
  },
};

export default event;
