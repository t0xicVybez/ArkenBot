
import type { GuildMember, PartialGuildMember } from 'discord.js';
import type { BotEvent } from '../types.js';
import { WelcomeModule } from '../modules/welcome/WelcomeModule.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';
import { PromotionModule } from '../modules/promotion/PromotionModule.js';

import { swallow } from '../logger.js';

// A member left (or was removed). Fan out to everything that cares: goodbye
// message, leave logging, analytics, invite-tracker bookkeeping, and promotion
// cleanup. allSettled so one failure doesn't block the others.
const event: BotEvent = {
  name: 'guildMemberRemove',
  async execute(_client: unknown, member: GuildMember | PartialGuildMember) {
    if (!member.guild) return;

    void PromotionModule.handleMemberRemove(member.guild.id, member.id).catch(swallow);

    const fullMember = member.partial
      ? await member.guild.members.fetch(member.id).catch(swallow)
      : member;

    if (!fullMember) return;

    await Promise.allSettled([
      WelcomeModule.handleLeave(fullMember.guild, fullMember),
      LoggingModule.logMemberLeave(fullMember.guild, fullMember),
      AnalyticsModule.trackLeave(fullMember.guild.id),
      InviteTrackerModule.handleLeave(fullMember),
    ]);
  },
};

export default event;
