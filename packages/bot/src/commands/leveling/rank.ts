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
import { t, resolveUserLocale } from '../../i18n/index.js';
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
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.rank.disabledTitle', loc), t('cmd.rank.disabled', loc))] });
      return;
    }

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const userLevel = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: targetUser.id } },
    });

    if (!userLevel) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.rank.noDataTitle', loc), t('cmd.rank.noData', loc, { user: targetUser.tag }))],
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
        .setTitle(t('cmd.rank.embedTitle', loc, { user: targetUser.tag }))
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: t('cmd.rank.fieldRank', loc), value: `#${rank + 1}`, inline: true },
          { name: t('cmd.rank.fieldLevel', loc), value: `${currentLevel}`, inline: true },
          { name: t('cmd.rank.fieldTotalXp', loc), value: `${currentXp.toLocaleString()}`, inline: true },
          { name: t('cmd.rank.fieldMessages', loc), value: `${userLevel.totalMessages.toLocaleString()}`, inline: true },
          {
            name: t('cmd.rank.fieldProgress', loc, { level: currentLevel + 1 }),
            value: `\`${progressBar}\`\n${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`,
          },
        )
        .setFooter({ text: interaction.guild.name });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
