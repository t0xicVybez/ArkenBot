
import type { GuildMember } from 'discord.js';
import type { BotEvent } from '../types.js';
import { WelcomeModule } from '../modules/welcome/WelcomeModule.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';
import { AutoModModule } from '../modules/automod/AutoModModule.js';
import { ensureGuildExists } from '../utils/settings.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';
import { VerificationModule } from '../modules/verification/VerificationModule.js';
import { BanNetworkModule } from '../modules/moderation/BanNetworkModule.js';

// A new member joined. Make sure the guild row exists, then fan out to every
// feature that reacts to joins: welcome, logging, join-gate automod, analytics,
// invite attribution, verification, and the shared ban-network check.
const event: BotEvent = {
  name: 'guildMemberAdd',
  async execute(_client: unknown, member: GuildMember) {
    await ensureGuildExists(
      member.guild.id,
      member.guild.name,
      member.guild.ownerId,
      member.guild.iconURL() ?? undefined
    );

    await Promise.allSettled([
      WelcomeModule.handleJoin(member.guild, member),
      LoggingModule.logMemberJoin(member.guild, member),
      AutoModModule.handleMemberJoin(member),
      AnalyticsModule.trackJoin(member.guild.id),
      InviteTrackerModule.handleJoin(member),
      VerificationModule.handleJoin(member),
      BanNetworkModule.checkMember(member),
    ]);
  },
};

export default event;
