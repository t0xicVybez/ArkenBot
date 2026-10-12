

import { type Guild, type User, type GuildMember, type TextChannel, type Message, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../../database.js';
import type { LevelRole } from '@prisma/client';
import { AchievementsModule } from './AchievementsModule.js';
import { redis } from '../../redis.js';
import { REDIS_KEYS, levelFromXp, formatTemplate } from '@arkenbot/shared';
import { getGuildSettings } from '../../utils/settings.js';
import { logger, swallow} from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../economy/EconomyModule.js';

export class LevelingModule {

  static async processMessage(guild: Guild, user: User, message?: Message): Promise<void> {
    if (user.bot) return;

    const settings = await getGuildSettings(guild.id);
    if (!settings?.levelingEnabled) return;

    const cooldownKey = REDIS_KEYS.USER_XP_COOLDOWN(guild.id, user.id);
    const onCooldown = await redis.exists(cooldownKey);
    if (onCooldown) return;

    await redis.setex(cooldownKey, settings.xpCooldown, '1');

    const base = Math.floor(settings.xpPerMessage * (0.75 + Math.random() * 0.5));
    let effectiveMultiplier = settings.xpMultiplier ?? 1.0;
    try {
      const member = message?.guild?.members.cache.get(user.id);
      if (member) {
        const roleMultipliers = await prisma.xpRoleMultiplier.findMany({ where: { guildId: guild.id } });
        if (roleMultipliers.length > 0) {
          const memberRoleIds = new Set(member.roles.cache.keys());
          const matching = roleMultipliers.filter((rm) => memberRoleIds.has(rm.roleId));
          if (matching.length > 0) {
            const highest = Math.max(...matching.map((rm) => rm.multiplier));
            effectiveMultiplier = effectiveMultiplier * highest;
          }
        }
      }

      if (message?.channelId) {
        const channelMultiplierRecord = await prisma.xpChannelMultiplier.findUnique({
          where: { guildId_channelId: { guildId: guild.id, channelId: message.channelId } },
        }).catch(swallow);
        const channelMultiplier = channelMultiplierRecord?.multiplier ?? 1.0;
        effectiveMultiplier = effectiveMultiplier * channelMultiplier;
      }
    } catch {  }
    const xpGain = Math.max(1, Math.round(base * effectiveMultiplier));

    const existing = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: user.id } },
    });

    const currentXp = (existing?.xp ?? 0) + xpGain;
    const currentLevel = existing?.level ?? 0;
    const newLevel = levelFromXp(currentXp);

    const todayUTC = new Date().toISOString().slice(0, 10);
    const lastDate = existing?.lastStreakDate?.toISOString().slice(0, 10);
    const yesterdayUTC = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let newStreak = existing?.streakDays ?? 0;
    let newLastStreakDate: Date | undefined;

    if (lastDate === todayUTC) {
      newStreak = existing?.streakDays ?? 1;
    } else if (lastDate === yesterdayUTC) {
      newStreak = (existing?.streakDays ?? 0) + 1;
      newLastStreakDate = new Date();
    } else {
      newStreak = 1;
      newLastStreakDate = new Date();
    }

    await prisma.userLevel.upsert({
      where: { guildId_userId: { guildId: guild.id, userId: user.id } },
      update: {
        xp: currentXp,
        level: newLevel,
        userTag: user.tag,
        totalMessages: { increment: 1 },
        ...(newLastStreakDate && { streakDays: newStreak, lastStreakDate: newLastStreakDate }),
      },
      create: {
        guildId: guild.id,
        userId: user.id,
        userTag: user.tag,
        xp: currentXp,
        level: newLevel,
        totalMessages: 1,
        streakDays: 1,
        lastStreakDate: new Date(),
      },
    });

    if (newLevel > currentLevel) {
      await this.handleLevelUp(
        guild,
        user,
        newLevel,
        settings.levelUpMessage,
        settings.levelUpChannelId,
        settings.levelUpEmbed ?? true,
        message,
        settings.levelUpColor,
      );

      await this.applyLevelRoles(guild, user.id, newLevel, settings.keepPreviousRoles ?? false);

      await EconomyModule.awardLevelUp(guild.id, user.id, newLevel).catch(swallow);
    }

    const totalMessages = (existing?.totalMessages ?? 0) + 1;
    await AchievementsModule.checkAndAward(guild.id, user.id, {
      level: newLevel,
      totalMessages,
      xp: currentXp,
      streakDays: newStreak,
    });
  }

  static async awardVoiceXp(guild: Guild, member: GuildMember, amount: number): Promise<void> {
    if (member.user.bot || amount <= 0) return;
    const settings = await getGuildSettings(guild.id);
    if (!settings?.levelingEnabled || !settings.voiceXpEnabled) return;

    let mult = settings.xpMultiplier ?? 1.0;
    const roleMultipliers = await prisma.xpRoleMultiplier.findMany({ where: { guildId: guild.id } }).catch(() => []);
    if (roleMultipliers.length) {
      const ids = new Set(member.roles.cache.keys());
      const matching = roleMultipliers.filter((rm) => ids.has(rm.roleId));
      if (matching.length) mult *= Math.max(...matching.map((rm) => rm.multiplier));
    }
    const gain = Math.max(1, Math.round(amount * mult));

    const existing = await prisma.userLevel.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: member.id } } });
    const currentXp = (existing?.xp ?? 0) + gain;
    const currentLevel = existing?.level ?? 0;
    const newLevel = levelFromXp(currentXp);

    await prisma.userLevel.upsert({
      where: { guildId_userId: { guildId: guild.id, userId: member.id } },
      update: { xp: currentXp, level: newLevel, userTag: member.user.tag },
      create: { guildId: guild.id, userId: member.id, userTag: member.user.tag, xp: currentXp, level: newLevel },
    });

    if (newLevel > currentLevel) {
      await this.handleLevelUp(guild, member.user, newLevel, settings.levelUpMessage, settings.levelUpChannelId, settings.levelUpEmbed ?? true, undefined, settings.levelUpColor);
      await this.applyLevelRoles(guild, member.id, newLevel, settings.keepPreviousRoles ?? false);
      await EconomyModule.awardLevelUp(guild.id, member.id, newLevel).catch(swallow);
    }
  }

  static async sweepVoiceXp(guild: Guild): Promise<void> {
    const settings = await getGuildSettings(guild.id);
    if (!settings?.levelingEnabled || !settings.voiceXpEnabled) return;
    const perMinute = settings.voiceXpPerMinute ?? 5;
    const afkId = guild.afkChannelId;
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased() || channel.id === afkId) continue;
      const humans = channel.members.filter((m) => !m.user.bot);
      if (humans.size < 2) continue;
      for (const member of humans.values()) {
        const vs = member.voice;
        if (vs.selfMute || vs.selfDeaf || vs.mute || vs.deaf) continue;
        await this.awardVoiceXp(guild, member, perMinute).catch(swallow);
      }
    }
  }

  private static readonly MILESTONES = new Set([5, 10, 25, 50, 75, 100, 150, 200]);

  private static getMilestoneLabel(level: number, loc: string): string | null {
    if (level >= 200) return t('leveling.milestones.legendary', loc);
    if (level >= 150) return t('leveling.milestones.diamond', loc);
    if (level >= 100) return t('leveling.milestones.century', loc);
    if (level >= 75)  return t('leveling.milestones.elite', loc);
    if (level >= 50)  return t('leveling.milestones.veteran', loc);
    if (level >= 25)  return t('leveling.milestones.experienced', loc);
    if (level >= 10)  return t('leveling.milestones.rising', loc);
    if (level >= 5)   return t('leveling.milestones.newcomer', loc);
    return null;
  }

  private static isMilestone(level: number): boolean {
    return LevelingModule.MILESTONES.has(level) || level % 50 === 0;
  }

  private static async handleLevelUp(
    guild: Guild,
    user: User,
    level: number,
    messageTemplate: string,
    channelId: string | undefined | null,
    useEmbed: boolean,
    sourceMessage?: Message,
    colorHex?: string,
  ): Promise<void> {
    try {

      let channel: TextChannel | null = null;

      if (channelId) {
        const ch = guild.channels.cache.get(channelId);
        if (ch?.isTextBased()) channel = ch as TextChannel;
      }

      if (!channel && sourceMessage?.channel?.isTextBased()) {
        channel = sourceMessage.channel as TextChannel;
      }

      if (!channel) return;

      const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });

      const content = formatTemplate(messageTemplate, {
        user: `<@${user.id}>`,
        username: user.username,
        level,
        server: guild.name,
      });

      if (!useEmbed) {
        await channel.send({ content }).catch(swallow);
        logger.debug(`${user.tag} leveled up to ${level} in ${guild.name}`);
        return;
      }

      const isMilestone = LevelingModule.isMilestone(level);
      const milestoneLabel = LevelingModule.getMilestoneLabel(level, loc);

      const embedColor = colorHex
        ? (parseInt(colorHex.replace('#', ''), 16) as import('discord.js').ColorResolvable)
        : isMilestone
          ? Colors.Gold
          : level >= 50 ? Colors.Purple
          : level >= 25 ? Colors.Blue
          : Colors.Blurple;

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(isMilestone ? t('leveling.milestoneReached', loc, { label: milestoneLabel ?? '' }) : t('leveling.levelUp', loc))
        .setDescription(content)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .addFields({ name: t('leveling.level', loc), value: `**${level}**`, inline: true })
        .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
        .setTimestamp();

      if (isMilestone && milestoneLabel) {
        embed.addFields({ name: t('leveling.achievement', loc), value: milestoneLabel, inline: true });
      }

      const msg = await channel.send({ embeds: [embed] }).catch(swallow);
      if (msg) {
        await prisma.userLevel.update({
          where: { guildId_userId: { guildId: guild.id, userId: user.id } },
          data: { levelUpMessageId: msg.id, levelUpChannelId: msg.channelId },
        }).catch(swallow);
      }
      logger.debug(`${user.tag} leveled up to ${level} in ${guild.name}`);
    } catch (err) {
      logger.error({ err }, 'Failed to handle level up');
    }
  }

  static async applyLevelRoles(
    guild: Guild,
    userId: string,
    currentLevel: number,
    keepPreviousRoles: boolean,
  ): Promise<void> {
    try {
      const allLevelRoles = await prisma.levelRole.findMany({ where: { guildId: guild.id } });
      if (allLevelRoles.length === 0) return;

      const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(swallow);
      if (!member) return;

      const earned = allLevelRoles.filter((lr: LevelRole) => lr.level <= currentLevel);
      const notEarned = allLevelRoles.filter((lr: LevelRole) => lr.level > currentLevel);

      if (keepPreviousRoles) {
        for (const lr of earned) {
          const role = guild.roles.cache.get(lr.roleId);
          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role, `Level ${lr.level} role reward`).catch(swallow);
          }
        }
      } else {

        const sorted = [...earned].sort((a, b) => b.level - a.level);
        const highest = sorted[0];
        const lowerEarned = sorted.slice(1);

        if (highest) {
          const role = guild.roles.cache.get(highest.roleId);
          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role, `Level ${highest.level} role reward`).catch(swallow);
          }
        }

        for (const lr of lowerEarned) {
          const role = guild.roles.cache.get(lr.roleId);
          if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role, 'Replaced by higher level role').catch(swallow);
          }
        }
      }

      for (const lr of notEarned) {
        const role = guild.roles.cache.get(lr.roleId);
        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(role, 'Level role not yet earned').catch(swallow);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to apply level roles');
    }
  }

  static async syncAllRoles(
    guild: Guild,
    keepPreviousRoles: boolean,
  ): Promise<{ processed: number; updated: number }> {
    const allLevelRoles = await prisma.levelRole.findMany({ where: { guildId: guild.id } });
    if (allLevelRoles.length === 0) return { processed: 0, updated: 0 };

    const userLevels = await prisma.userLevel.findMany({ where: { guildId: guild.id } });
    let updated = 0;

    for (const ul of userLevels) {
      try {
        const before = guild.members.cache.get(ul.userId)?.roles.cache.size ?? 0;
        await this.applyLevelRoles(guild, ul.userId, ul.level, keepPreviousRoles);
        const after = guild.members.cache.get(ul.userId)?.roles.cache.size ?? 0;
        if (before !== after) updated++;
      } catch {  }
    }

    return { processed: userLevels.length, updated };
  }
}
