/**
 * HighlightsModule — a weekly community recap posted to a configured channel.
 * Distinct from the analytics report: this is a friendly, member-facing digest
 * of the past 7 days (messages, new members, top starred message, XP leaders).
 */
import { EmbedBuilder, type TextChannel, type Guild } from 'discord.js';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { COLORS } from '@arkenbot/shared';
import { swallow } from '../logger.js';
import { t, resolveUserLocale } from '../i18n/index.js';

/** ISO year-week key (e.g. "2026-W34") used to dedupe the weekly post. */
function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

export class HighlightsModule {
  /** Build and post the weekly digest for one guild. Returns false if nothing to post. */
  static async postDigest(guild: Guild): Promise<boolean> {
    const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
    if (!settings?.highlightsEnabled || !settings.highlightsChannelId) return false;
    const channel = guild.channels.cache.get(settings.highlightsChannelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return false;

    // Exactly-once-per-week guard so a restart or overlapping tick can't double-post.
    const guard = await redis.set(`highlights:${guild.id}:${isoWeek()}`, '1', 'EX', 8 * 86400, 'NX').catch(() => 'OK');
    if (guard !== 'OK') return false;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });

    // Messages in the last 7 days (daily activity buckets).
    const activity = await prisma.messageActivity.findMany({ where: { guildId: guild.id, date: { gte: weekAgo } }, select: { count: true } }).catch(() => []);
    const messages = activity.reduce((sum, a) => sum + a.count, 0);

    // New members via invite-join tracking.
    const newMembers = await prisma.inviteJoin.count({ where: { guildId: guild.id, joinedAt: { gte: weekAgo } } }).catch(() => 0);

    // Top starred message created this week.
    const topStar = await prisma.starboardEntry.findFirst({ where: { guildId: guild.id, createdAt: { gte: weekAgo } }, orderBy: { starCount: 'desc' } }).catch(() => null);

    // Current XP leaders (snapshot).
    const leaders = await prisma.userLevel.findMany({ where: { guildId: guild.id }, orderBy: { xp: 'desc' }, take: 3 }).catch(() => []);

    // Nothing happened — skip the post rather than sending an empty digest.
    if (messages === 0 && newMembers === 0 && !topStar && leaders.length === 0) return false;

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('highlights.title', loc, { server: guild.name }))
      .setDescription(t('highlights.subtitle', loc))
      .setThumbnail(guild.iconURL() ?? null)
      .addFields(
        { name: t('highlights.messages', loc), value: `**${messages.toLocaleString()}**`, inline: true },
        { name: t('highlights.newMembers', loc), value: `**${newMembers.toLocaleString()}**`, inline: true },
      )
      .setTimestamp();

    if (topStar) {
      const link = `https://discord.com/channels/${guild.id}/${topStar.originalChanId}/${topStar.originalMsgId}`;
      embed.addFields({ name: t('highlights.topStar', loc), value: t('highlights.topStarValue', loc, { stars: String(topStar.starCount), user: `<@${topStar.authorId}>`, link }) });
    }
    if (leaders.length) {
      const medals = ['🥇', '🥈', '🥉'];
      embed.addFields({ name: t('highlights.xpLeaders', loc), value: leaders.map((l, i) => `${medals[i]} <@${l.userId}> — ${t('highlights.levelValue', loc, { level: String(l.level) })}`).join('\n') });
    }

    await channel.send({ embeds: [embed] }).catch(swallow);
    return true;
  }
}
