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

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Leveling Disabled', 'The leveling system is disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const userLevel = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: targetUser.id } },
    });

    if (!userLevel) {
      await interaction.editReply({
        embeds: [errorEmbed('No Data', `${targetUser.username} hasn't earned any XP yet.`)],
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
      : 'Never';

    const embed = new EmbedBuilder()
      .setColor(streak >= 7 ? Colors.Orange : Colors.Blurple)
      .setTitle(`${targetUser.username}'s Engagement Stats`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '🏆 Rank', value: `#${rank}`, inline: true },
        { name: '📈 Level', value: `${userLevel.level}`, inline: true },
        { name: '✨ Total XP', value: `${userLevel.xp.toLocaleString()}`, inline: true },
        { name: '💬 Messages Sent', value: `${userLevel.totalMessages.toLocaleString()}`, inline: true },
        { name: `${streakEmoji} Day Streak`, value: `${streak} day${streak === 1 ? '' : 's'}`, inline: true },
        { name: '⭐ Reputation', value: `${repReceived}`, inline: true },
        { name: '🎖️ Achievements', value: `${achievementCount}`, inline: true },
        { name: '🕐 Last Active', value: lastActive, inline: true },
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
