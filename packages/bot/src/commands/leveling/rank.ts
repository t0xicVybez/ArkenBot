/**
 * /rank command — generates and sends a graphical rank card for a member.
 * Falls back to an embed when canvas rendering fails.
 */
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS, xpForLevel } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { getGuildSettings } from '../../utils/settings.js';
import { generateRankCard } from '../../utils/rankCard.js';
import { logger } from '../../logger.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or someone else\'s rank card')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to check (defaults to yourself)').setRequired(false)
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
        embeds: [errorEmbed('No Data', `${targetUser.tag} has not earned any XP yet.`)],
      });
      return;
    }

    const rank = await prisma.userLevel.count({
      where: { guildId: interaction.guild.id, xp: { gt: userLevel.xp } },
    });

    const currentLevel = userLevel.level;
    const currentXp = userLevel.xp;
    const xpNeeded = xpForLevel(currentLevel + 1);

    let xpInLevel = currentXp;
    for (let i = 0; i <= currentLevel; i++) {
      xpInLevel -= xpForLevel(i);
    }
    if (xpInLevel < 0) xpInLevel = 0;

    const style = await prisma.userRankCardStyle.findUnique({ where: { userId: targetUser.id } });

    try {
      const cardBuffer = await generateRankCard({
        username: targetUser.username,
        avatarUrl: targetUser.displayAvatarURL({ extension: 'png' }),
        rank: rank + 1,
        level: currentLevel,
        xpInLevel,
        xpNeeded,
        totalXp: currentXp,
        totalMessages: userLevel.totalMessages,
        accentColor:   style?.accentColor ?? undefined,
        backgroundUrl: style?.backgroundUrl ?? undefined,
      });

      const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      logger.error({ err }, 'Failed to generate rank card, falling back to embed');

      const progressBarLength = 20;
      const filled = Math.round((xpInLevel / xpNeeded) * progressBarLength);
      const progressBar = '█'.repeat(filled) + '░'.repeat(progressBarLength - filled);

      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`📊 ${targetUser.tag}'s Rank`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: '🏆 Rank', value: `#${rank + 1}`, inline: true },
          { name: '📈 Level', value: `${currentLevel}`, inline: true },
          { name: '✨ Total XP', value: `${currentXp.toLocaleString()}`, inline: true },
          { name: '💬 Messages', value: `${userLevel.totalMessages.toLocaleString()}`, inline: true },
          {
            name: `Progress to Level ${currentLevel + 1}`,
            value: `\`${progressBar}\`\n${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`,
          },
        )
        .setFooter({ text: interaction.guild.name });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
