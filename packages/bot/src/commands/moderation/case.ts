/**
 * /case command — view a specific moderation case by number, or bulk-close all
 * open cases for a user (e.g. when unbanning someone).
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { errorEmbed, successEmbed } from '../../utils/embed.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { COLORS, formatDuration } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Manage moderation cases')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('Look up a moderation case by number')
        .addIntegerOption((o) =>
          o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('bulk-close')
        .setDescription('Close all open cases for a user')
        .addUserOption((o) => o.setName('user').setDescription('User whose cases to close').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for closing').setRequired(false)),
    ),
  category: 'moderation',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({
        embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')],
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const caseNumber = interaction.options.getInteger('number', true);

      const moderationCase = await prisma.moderationCase.findUnique({
        where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
      });

      if (!moderationCase) {
        await interaction.editReply({ embeds: [errorEmbed('Not Found', `Case #${caseNumber} not found.`)] });
        return;
      }

      const typeColors: Record<string, number> = {
        ban:    COLORS.ERROR,
        tempban: COLORS.ERROR,
        kick:   COLORS.WARNING,
        mute:   COLORS.WARNING,
        unmute: COLORS.SUCCESS,
        unban:  COLORS.SUCCESS,
        warn:   0xffa500,
      };

      const typeEmojis: Record<string, string> = {
        ban:    '🔨',
        tempban: '⏱️',
        kick:   '👢',
        mute:   '🔇',
        unmute: '🔊',
        unban:  '✅',
        warn:   '⚠️',
      };

      const embed = new EmbedBuilder()
        .setColor(typeColors[moderationCase.type] ?? COLORS.NEUTRAL)
        .setTitle(`${typeEmojis[moderationCase.type] ?? '📋'} Case #${caseNumber} — ${moderationCase.type.toUpperCase()}`)
        .addFields(
          { name: 'User',      value: `${moderationCase.userTag} (${moderationCase.userId})`, inline: true },
          { name: 'Moderator', value: moderationCase.moderatorTag, inline: true },
          { name: 'Reason',    value: moderationCase.reason },
          { name: 'Status',    value: moderationCase.active ? '🔴 Active' : '🟢 Resolved', inline: true },
          { name: 'Date',      value: `<t:${Math.floor(moderationCase.createdAt.getTime() / 1000)}:F>`, inline: true },
        )
        .setTimestamp(moderationCase.createdAt);

      if (moderationCase.duration) {
        embed.addFields({ name: 'Duration', value: formatDuration(moderationCase.duration), inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'bulk-close') {
      const user   = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'Bulk closed by moderator';

      const result = await prisma.moderationCase.updateMany({
        where: { guildId: interaction.guild.id, userId: user.id, active: true },
        data:  { active: false },
      });

      if (result.count === 0) {
        await interaction.editReply({
          embeds: [errorEmbed('No Open Cases', `No open cases found for ${user.tag}.`)],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Cases Closed',
            `Closed **${result.count}** open case${result.count === 1 ? '' : 's'} for ${user.tag}.\n**Reason:** ${reason}`,
          ),
        ],
      });
    }
  },
};

export default command;
