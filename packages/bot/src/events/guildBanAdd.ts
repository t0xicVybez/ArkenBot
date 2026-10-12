
import { Events, AuditLogEvent, type GuildBan } from 'discord.js';
import type { BotEvent } from '../types.js';
import { AntiNukeModule } from '../modules/antiNuke/AntiNukeModule.js';
import { logger } from '../logger.js';

// Anti-nuke: when a ban happens, read the audit log to find who did it and feed
// that to the rate tracker, so a compromised account mass-banning gets caught.
const event: BotEvent = {
  name: Events.GuildBanAdd,
  async execute(_client: unknown, ban: GuildBan) {
    const guild = ban.guild;
    try {
      const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const entry = auditLogs.entries.first();
      if (entry?.executor && entry.executor.id !== ban.user.id) {
        await AntiNukeModule.trackAction(guild, entry.executor.id, 'ban');
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id }, 'guildBanAdd anti-nuke error');
    }
  },
};

export default event;
