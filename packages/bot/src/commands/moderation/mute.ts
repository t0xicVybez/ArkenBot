/**
 * /mute command — applies a Discord timeout to a member for a given duration
 * (maximum 28 days, the Discord API limit), creates a case, and logs the action.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { moderationEmbed, errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { canModerate } from '../../utils/permissions.js';
import { parseDuration, formatDuration } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout (mute) a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to mute').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d) - max 28 days').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the mute').setRequired(false)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.disabledTitle', loc), t('moderation.disabled', loc))] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const durationSeconds = parseDuration(durationStr);
    if (!durationSeconds) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.mute.invalidDurationTitle', loc), t('cmd.mute.invalidDuration', loc))],
      });
      return;
    }

    const maxTimeout = 28 * 24 * 60 * 60; // Discord enforces a 28-day maximum for timeouts.
    if (durationSeconds > maxTimeout) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.mute.tooLongTitle', loc), t('cmd.mute.tooLong', loc))],
      });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(swallow);

    if (!targetMember) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.mute.notFoundTitle', loc), t('cmd.mute.notFound', loc))] });
      return;
    }

    if (!canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.mute.hierarchyTitle', loc), t('cmd.mute.hierarchyUser', loc))],
      });
      return;
    }

    if (!targetMember.moderatable) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.mute.hierarchyTitle', loc), t('cmd.mute.notMutable', loc))] });
      return;
    }

    try {
      const expiresAt = new Date(Date.now() + durationSeconds * 1000);

      await targetUser
        .send({
          embeds: [
            moderationEmbed({
              action: t('cmd.mute.dmAction', loc, { guild: interaction.guild.name }),
              user: targetUser.tag,
              moderator: interaction.user.tag,
              reason,
              duration: formatDuration(durationSeconds),
            }, settings?.moderationColor),
          ],
        })
        .catch(swallow);

      await targetMember.timeout(durationSeconds * 1000, `${reason} | Moderator: ${interaction.user.tag}`);

      const caseNumber = await getNextCaseNumber(interaction.guild.id);
      await prisma.moderationCase.create({
        data: {
          caseNumber,
          guildId: interaction.guild.id,
          type: 'mute',
          userId: targetUser.id,
          userTag: targetUser.tag,
          moderatorId: interaction.user.id,
          moderatorTag: interaction.user.tag,
          reason,
          duration: durationSeconds,
          expiresAt,
          active: true,
        },
      });

      const replyMsg = await interaction.editReply({
        embeds: [
          moderationEmbed({
            action: t('cmd.mute.action', loc),
            user: `${targetUser.tag} (${targetUser.id})`,
            moderator: interaction.user.tag,
            reason,
            duration: formatDuration(durationSeconds),
            caseNumber,
          }, settings?.moderationColor),
        ],
      });
      await prisma.moderationCase.update({
        where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
        data: { messageId: replyMsg.id, channelId: replyMsg.channelId },
      }).catch(swallow);

      await LoggingModule.logModerationAction(interaction.guild, {
        type: 'mute',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        duration: durationSeconds,
        guildId: interaction.guild.id,
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.mute.failedTitle', loc), t('cmd.mute.failed', loc))] });
    }
  },
};

export default command;
