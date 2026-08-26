/**
 * /leaderboard command — displays a paginated XP leaderboard for the guild,
 * with a link button to the full web leaderboard.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';
import { config } from '../../config.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the XP leaderboard')
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number').setMinValue(1).setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('period').setDescription('Timeframe').setRequired(false)
        .addChoices(
          { name: 'All time', value: 'all' },
          { name: 'This week', value: 'weekly' },
          { name: 'This month', value: 'monthly' },
        )
    ),
  category: 'leveling',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.leaderboard.disabledTitle', loc), t('cmd.leaderboard.disabled', loc))] });
      return;
    }

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const page = (interaction.options.getInteger('page') ?? 1) - 1;
    const pageSize = 10;
    const period = interaction.options.getString('period') ?? 'all';

    // Time-filtered periods rank users who have been active within the window
    // (mirrors the web leaderboard's `updatedAt` filter).
    const where: { guildId: string; updatedAt?: { gte: Date } } = { guildId: interaction.guild.id };
    if (period === 'weekly') where.updatedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    else if (period === 'monthly') where.updatedAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };

    const users = await prisma.userLevel.findMany({
      where,
      orderBy: { xp: 'desc' },
      skip: page * pageSize,
      take: pageSize,
    });

    const total = await prisma.userLevel.count({ where });

    if (users.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.leaderboard.emptyTitle', loc), t('cmd.leaderboard.empty', loc))],
      });
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const offset = page * pageSize;

    const description = users
      .map((u, i) => {
        const rank = offset + i + 1;
        const medal = rank <= 3 ? medals[rank - 1] : `**#${rank}**`;
        return t('cmd.leaderboard.line', loc, { medal, user: `<@${u.userId}>`, level: u.level, xp: u.xp.toLocaleString() });
      })
      .join('\n');

    const leaderboardUrl = `${config.webUrl}/leaderboard/${interaction.guild.id}`;

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.leaderboard.title', loc, { guild: interaction.guild.name }) + (period === 'all' ? '' : ` · ${t(`cmd.leaderboard.period.${period}`, loc)}`))
      .setDescription(description)
      .setFooter({ text: t('cmd.leaderboard.footer', loc, { page: page + 1, pages: Math.ceil(total / pageSize), total }) })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(t('cmd.leaderboard.viewFull', loc))
        .setStyle(ButtonStyle.Link)
        .setURL(leaderboardUrl)
        .setEmoji('🏆')
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};

export default command;
