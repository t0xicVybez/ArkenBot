/**
 * /unban command — lifts a ban by user ID, resolves any active ban cases,
 * and records a new unban case.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed, errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((opt) =>
      opt.setName('user_id').setDescription('The user ID to unban').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for unban').setRequired(false)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.disabledTitle', loc), t('moderation.disabled', loc))] });
      return;
    }

    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.unban.invalidIdTitle', loc), t('cmd.unban.invalidId', loc))] });
      return;
    }

    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(swallow);
      if (!ban) {
        await interaction.editReply({ embeds: [errorEmbed(t('cmd.unban.notBannedTitle', loc), t('cmd.unban.notBanned', loc))] });
        return;
      }

      await interaction.guild.members.unban(userId, `${reason} | Moderator: ${interaction.user.tag}`);

      // Mark existing active ban/tempban cases as resolved so dashboards reflect the change.
      await prisma.moderationCase.updateMany({
        where: {
          guildId: interaction.guild.id,
          userId,
          type: { in: ['ban', 'tempban'] },
          active: true,
        },
        data: { active: false },
      });

      const caseNumber = await getNextCaseNumber(interaction.guild.id);
      await prisma.moderationCase.create({
        data: {
          caseNumber,
          guildId: interaction.guild.id,
          type: 'unban',
          userId,
          userTag: ban.user.tag,
          moderatorId: interaction.user.id,
          moderatorTag: interaction.user.tag,
          reason,
          active: false,
        },
      });

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.unban.successTitle', loc), t('cmd.unban.success', loc, { user: ban.user.tag, userId, reason }))],
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.unban.failedTitle', loc), t('cmd.unban.failed', loc))] });
    }
  },
};

export default command;
