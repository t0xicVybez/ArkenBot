/**
 * guildMemberAdd event — runs when a member joins a guild. Triggers welcome
 * messages, join logging, auto-mod account-age checks, analytics tracking,
 * and invite attribution in parallel.
 */
import type { GuildMember } from 'discord.js';
import type { BotEvent } from '../types.js';
import { WelcomeModule } from '../modules/welcome/WelcomeModule.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';
import { AutoModModule } from '../modules/automod/AutoModModule.js';
import { ensureGuildExists } from '../utils/settings.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

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
    ]);
  },
};

export default event;
