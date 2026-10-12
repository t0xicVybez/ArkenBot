
import { Events, AuditLogEvent, type Role } from 'discord.js';
import type { BotEvent } from '../types.js';
import { AntiNukeModule } from '../modules/antiNuke/AntiNukeModule.js';
import { logger } from '../logger.js';
import { isPermissionError } from '../utils/permissionAlert.js';

// Anti-nuke: attribute role deletions to their executor via the audit log and
// track the rate. Missing audit-log access is expected (logged at debug).
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

      if (isPermissionError(err)) {
        logger.debug({ err, guildId: guild.id }, 'guildRoleDelete: no audit-log access');
      } else {
        logger.error({ err, guildId: guild.id }, 'guildRoleDelete anti-nuke error');
      }
    }
  },
};

export default event;
