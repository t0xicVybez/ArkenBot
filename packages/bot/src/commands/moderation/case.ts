/**
 * /case command — retrieves and displays a single moderation case by its case number.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { errorEmbed } from '../../utils/embed.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { COLORS, formatDuration } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Look up a moderation case')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)
    ),
  category: 'moderation',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const caseNumber = interaction.options.getInteger('number', true);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const moderationCase = await prisma.moderationCase.findUnique({
      where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
    });

    if (!moderationCase) {
      await interaction.editReply({ embeds: [errorEmbed('Not Found', `Case #${caseNumber} not found.`)] });
      return;
    }

    const typeColors: Record<string, number> = {
      ban: COLORS.ERROR,
      tempban: COLORS.ERROR,
      kick: COLORS.WARNING,
      mute: COLORS.WARNING,
      unmute: COLORS.SUCCESS,
      unban: COLORS.SUCCESS,
      warn: 0xffa500,
    };

    const typeEmojis: Record<string, string> = {
      ban: '🔨',
      tempban: '⏱️',
      kick: '👢',
      mute: '🔇',
      unmute: '🔊',
      unban: '✅',
      warn: '⚠️',
    };

    const embed = new EmbedBuilder()
      .setColor(typeColors[moderationCase.type] ?? COLORS.NEUTRAL)
      .setTitle(`${typeEmojis[moderationCase.type] ?? '📋'} Case #${caseNumber} — ${moderationCase.type.toUpperCase()}`)
      .addFields(
        { name: 'User', value: `${moderationCase.userTag} (${moderationCase.userId})`, inline: true },
        { name: 'Moderator', value: `${moderationCase.moderatorTag}`, inline: true },
        { name: 'Reason', value: moderationCase.reason },
        { name: 'Status', value: moderationCase.active ? '🔴 Active' : '🟢 Resolved', inline: true },
        { name: 'Date', value: `<t:${Math.floor(moderationCase.createdAt.getTime() / 1000)}:F>`, inline: true },
      )
      .setTimestamp(moderationCase.createdAt);

    if (moderationCase.duration) {
      embed.addFields({
        name: 'Duration',
        value: formatDuration(moderationCase.duration),
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
