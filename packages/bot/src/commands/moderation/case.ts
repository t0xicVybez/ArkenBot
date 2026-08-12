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
import { t, resolveUserLocale } from '../../i18n/index.js';
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
    const loc = await resolveUserLocale(interaction);

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({
        embeds: [errorEmbed(t('moderation.disabledTitle', loc), t('moderation.disabled', loc))],
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const caseNumber = interaction.options.getInteger('number', true);

      const moderationCase = await prisma.moderationCase.findUnique({
        where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
      });

      if (!moderationCase) {
        await interaction.editReply({ embeds: [errorEmbed(t('cmd.case.notFoundTitle', loc), t('cmd.case.notFound', loc, { number: caseNumber }))] });
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
        .setTitle(`${typeEmojis[moderationCase.type] ?? '📋'} ${t('cmd.case.caseLabel', loc, { number: caseNumber })} — ${moderationCase.type.toUpperCase()}`)
        .addFields(
          { name: t('cmd.case.fieldUser', loc),      value: `${moderationCase.userTag} (${moderationCase.userId})`, inline: true },
          { name: t('cmd.case.fieldModerator', loc), value: moderationCase.moderatorTag, inline: true },
          { name: t('cmd.case.fieldReason', loc),    value: moderationCase.reason },
          { name: t('cmd.case.fieldStatus', loc),    value: moderationCase.active ? t('cmd.case.statusActive', loc) : t('cmd.case.statusResolved', loc), inline: true },
          { name: t('cmd.case.fieldDate', loc),      value: `<t:${Math.floor(moderationCase.createdAt.getTime() / 1000)}:F>`, inline: true },
        )
        .setTimestamp(moderationCase.createdAt);

      if (moderationCase.duration) {
        embed.addFields({ name: t('cmd.case.fieldDuration', loc), value: formatDuration(moderationCase.duration), inline: true });
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
          embeds: [errorEmbed(t('cmd.case.noOpenTitle', loc), t('cmd.case.noOpen', loc, { user: user.tag }))],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            t('cmd.case.closedTitle', loc),
            t('cmd.case.closed', loc, { count: result.count, user: user.tag, reason }),
          ),
        ],
      });
    }
  },
};

export default command;
