/**
 * guildMemberRemove event — runs when a member leaves or is removed from a guild.
 * Fetches full member data if the Discord.js cache provides only a partial object,
 * then triggers farewell messages, leave logging, analytics, and invite tracking.
 */
import type { GuildMember, PartialGuildMember } from 'discord.js';
import type { BotEvent } from '../types.js';
import { WelcomeModule } from '../modules/welcome/WelcomeModule.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

import { swallow } from '../logger.js';
const event: BotEvent = {
  name: 'guildMemberRemove',
  async execute(_client: unknown, member: GuildMember | PartialGuildMember) {
    if (!member.guild) return;
    // Partial members lack roles and other data needed by downstream handlers.
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
