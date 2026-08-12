/**
 * /stats command — shows a member's engagement statistics: rank, level, XP,
 * message count, activity streak, reputation, and achievement count.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View detailed engagement stats for a member')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Member to view (defaults to yourself)').setRequired(false),
    ),
  category: 'leveling',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.stats.disabledTitle', loc), t('cmd.stats.disabled', loc))] });
      return;
    }

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const userLevel = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: targetUser.id } },
    });

    if (!userLevel) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.stats.noDataTitle', loc), t('cmd.stats.noData', loc, { user: targetUser.username }))],
      });
      return;
    }

    const rank = await prisma.userLevel.count({
      where: { guildId: interaction.guild.id, xp: { gt: userLevel.xp } },
    }) + 1;

    const repReceived = await prisma.reputation.count({
      where: { guildId: interaction.guild.id, receiverId: targetUser.id },
    });

    const achievementCount = await prisma.userAchievement.count({
      where: { guildId: interaction.guild.id, userId: targetUser.id },
    });

    const streak = userLevel.streakDays ?? 0;
    // Emoji escalates at 7-, 30-, and 100-day milestones to reward consistent activity.
    const streakEmoji = streak >= 100 ? '💯' : streak >= 30 ? '🌟' : streak >= 7 ? '🔥' : '❄️';

    const lastActive = userLevel.updatedAt
      ? `<t:${Math.floor(userLevel.updatedAt.getTime() / 1000)}:R>`
      : t('cmd.stats.never', loc);

    const embed = new EmbedBuilder()
      .setColor(streak >= 7 ? Colors.Orange : Colors.Blurple)
      .setTitle(t('cmd.stats.title', loc, { user: targetUser.username }))
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: t('cmd.stats.fieldRank', loc), value: `#${rank}`, inline: true },
        { name: t('cmd.stats.fieldLevel', loc), value: `${userLevel.level}`, inline: true },
        { name: t('cmd.stats.fieldTotalXp', loc), value: `${userLevel.xp.toLocaleString()}`, inline: true },
        { name: t('cmd.stats.fieldMessages', loc), value: `${userLevel.totalMessages.toLocaleString()}`, inline: true },
        { name: `${streakEmoji} ${t('cmd.stats.fieldDayStreak', loc)}`, value: t('cmd.stats.dayValue', loc, { count: streak }), inline: true },
        { name: t('cmd.stats.fieldReputation', loc), value: `${repReceived}`, inline: true },
        { name: t('cmd.stats.fieldAchievements', loc), value: `${achievementCount}`, inline: true },
        { name: t('cmd.stats.fieldLastActive', loc), value: lastActive, inline: true },
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
