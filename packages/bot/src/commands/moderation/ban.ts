/**
 * /ban command — bans a member permanently or for a specified duration, with
 * optional message deletion. Creates a moderation case and logs the action.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { moderationEmbed, errorEmbed } from '../../utils/embed.js';
import { canModerate, isBotOwner } from '../../utils/permissions.js';
import { parseDuration, formatDuration } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to ban').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the ban').setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('Temp ban duration (e.g. 1d, 12h, 30m). Leave empty for permanent.')
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('delete_messages')
        .setDescription('Delete messages from the last N days (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply();

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const durationStr = interaction.options.getString('duration');
    const deleteMessages = interaction.options.getInteger('delete_messages') ?? 0;

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'You cannot ban yourself.')] });
      return;
    }

    if (targetUser.id === client.user?.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'I cannot ban myself.')] });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    let targetMember = await interaction.guild.members.fetch(targetUser.id).catch(swallow);

    if (targetMember) {
      if (!canModerate(moderator, targetMember)) {
        await interaction.editReply({
          embeds: [errorEmbed('Hierarchy Error', 'You cannot ban a member with a higher or equal role.')],
        });
        return;
      }

      const botMember = await interaction.guild.members.fetchMe();
      if (!canModerate(botMember, targetMember)) {
        await interaction.editReply({
          embeds: [errorEmbed('Hierarchy Error', 'I cannot ban this member due to role hierarchy.')],
        });
        return;
      }
    }

    let durationSeconds: number | undefined;
    let expiresAt: Date | undefined;

    if (durationStr) {
      durationSeconds = parseDuration(durationStr) ?? undefined;
      if (!durationSeconds) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Duration', 'Invalid duration format. Examples: `1d`, `12h`, `30m`')],
        });
        return;
      }
      expiresAt = new Date(Date.now() + durationSeconds * 1000);
    }

    try {
      // Attempt DM notification before the ban so the message can actually be delivered.
      if (targetMember) {
        await targetUser
          .send({
            embeds: [
              moderationEmbed({
                action: durationStr ? `Temporarily Banned from ${interaction.guild.name}` : `Banned from ${interaction.guild.name}`,
                user: targetUser.tag,
                moderator: interaction.user.tag,
                reason,
                duration: durationStr ? formatDuration(durationSeconds!) : undefined,
              }, settings?.moderationColor),
            ],
          })
          .catch(swallow);
      }

      await interaction.guild.members.ban(targetUser.id, {
        reason: `${reason} | Moderator: ${interaction.user.tag}`,
        deleteMessageSeconds: deleteMessages * 86400,
      });

      const caseNumber = await getNextCaseNumber(interaction.guild.id);
      await prisma.moderationCase.create({
        data: {
          caseNumber,
          guildId: interaction.guild.id,
          type: durationStr ? 'tempban' : 'ban',
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

      // The TempBan row is polled by the background job scheduler to lift bans on expiry.
      if (durationStr && expiresAt) {
        await prisma.tempBan.create({
          data: {
            guildId: interaction.guild.id,
            userId: targetUser.id,
            moderatorId: interaction.user.id,
            reason,
            expiresAt,
          },
        });
      }

      const embed = moderationEmbed({
        action: durationStr ? 'Temp Ban' : 'Ban',
        user: `${targetUser.tag} (${targetUser.id})`,
        moderator: interaction.user.tag,
        reason,
        duration: durationStr ? formatDuration(durationSeconds!) : undefined,
        caseNumber,
      }, settings?.moderationColor);

      const replyMsg = await interaction.editReply({ embeds: [embed] });
      await prisma.moderationCase.update({
        where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
        data: { messageId: replyMsg.id, channelId: replyMsg.channelId },
      }).catch(swallow);

      await LoggingModule.logModerationAction(interaction.guild, {
        type: durationStr ? 'tempban' : 'ban',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        duration: durationSeconds,
        guildId: interaction.guild.id,
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [errorEmbed('Failed', 'I could not ban that user. Check my permissions and role hierarchy.')],
      });
    }
  },
};

export default command;
