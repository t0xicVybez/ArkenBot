
/**
 * Handles top.gg votes. When a user votes for the bot, top.gg calls our webhook
 * and the API forwards it here, where we grant rewards, track voting streaks,
 * and thank the voter. Voting is allowed every 12 hours.
 */
import type { Client, GuildMember, TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow} from '../../logger.js';
import { classifyError } from '@arkenbot/shared';

// top.gg lets each user vote once per 12 hours.
const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// A streak survives if the next vote comes within 36 hours of the last.
const STREAK_WINDOW_MS = 36 * 60 * 60 * 1000;

export class TopggModule {

  static async processVote(client: Client, userId: string, weight: number, guildId?: string): Promise<void> {
    const now = new Date();
    const doubled = weight >= 2;

    const voter = await this.recordVote(userId, now);
    logger.info({ userId, weight, guildId: guildId ?? null, streak: voter.currentStreak, total: voter.totalVotes }, 'top.gg vote received');

    const voteUrl = guildId
      ? `https://top.gg/servers/${guildId}/vote`
      : `https://top.gg/bot/${client.user!.id}/vote`;

    const configs = await prisma.topggConfig.findMany({
      where: guildId ? { guildId, enabled: true } : { enabled: true },
    });
    if (configs.length === 0) return;

    for (const config of configs) {
      const guild = client.guilds.cache.get(config.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(userId).catch(swallow);
      if (!member) continue;

      await this.grantVoterRole(member, config.voterRoleId, config.voterRoleHours).catch((err) =>
        logger.warn({ err: classifyError(err), guildId: config.guildId }, 'top.gg voter-role grant failed'),
      );

      const xp = config.weekendDouble && doubled ? config.xpReward * 2 : config.xpReward;
      if (xp > 0) await this.grantXp(config.guildId, member, xp);

      await this.announce(config.announceChannelId, config.announceMessage, member, voter, config.voteUrl || voteUrl);
    }
  }

  private static async recordVote(userId: string, now: Date) {
    const existing = await prisma.topggVoter.findUnique({ where: { userId } });
    const withinStreak =
      existing?.lastVotedAt && now.getTime() - existing.lastVotedAt.getTime() <= STREAK_WINDOW_MS;
    const currentStreak = withinStreak ? existing!.currentStreak + 1 : 1;

    return prisma.topggVoter.upsert({
      where: { userId },
      create: {
        userId, totalVotes: 1, currentStreak: 1, longestStreak: 1,
        lastVotedAt: now, eligibleAt: new Date(now.getTime() + VOTE_COOLDOWN_MS), reminderSent: false,
      },
      update: {
        totalVotes: { increment: 1 },
        currentStreak,
        longestStreak: Math.max(existing?.longestStreak ?? 0, currentStreak),
        lastVotedAt: now,
        eligibleAt: new Date(now.getTime() + VOTE_COOLDOWN_MS),
        reminderSent: false,
      },
    });
  }

  private static async grantVoterRole(member: GuildMember, roleId: string | null, hours: number): Promise<void> {
    if (!roleId) return;
    const role = member.guild.roles.cache.get(roleId);
    if (!role) return;

    await member.roles.add(roleId, 'top.gg vote reward');
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    await prisma.tempRole.upsert({
      where: { guildId_userId_roleId: { guildId: member.guild.id, userId: member.id, roleId } },
      create: { guildId: member.guild.id, userId: member.id, roleId, moderatorId: member.client.user.id, reason: 'top.gg vote reward', expiresAt },
      update: { removed: false, expiresAt, reason: 'top.gg vote reward' },
    });
  }

  private static async grantXp(guildId: string, member: GuildMember, amount: number): Promise<void> {
    await prisma.userLevel
      .upsert({
        where: { guildId_userId: { guildId, userId: member.id } },
        create: { guildId, userId: member.id, userTag: member.user.tag, xp: amount, level: 0 },
        update: { xp: { increment: amount } },
      })
      .catch((err) => logger.warn({ err: classifyError(err), guildId }, 'top.gg XP grant failed'));
  }

  private static async announce(
    channelId: string | null,
    template: string,
    member: GuildMember,
    voter: { currentStreak: number; totalVotes: number },
    voteUrl: string,
  ): Promise<void> {
    if (!channelId) return;
    const channel = member.guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const content = template
      .replace(/\{user\}/g, `<@${member.id}>`)
      .replace(/\{url\}/g, voteUrl)
      .replace(/\{streak\}/g, String(voter.currentStreak))
      .replace(/\{count\}/g, String(voter.totalVotes));

    await channel.send({ content, allowedMentions: { users: [member.id] } }).catch((err) =>
      logger.warn({ err: classifyError(err), channelId }, 'top.gg announcement failed'),
    );
  }
}
