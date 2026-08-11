/**
 * /kick command — removes a member from the guild, creates a moderation case,
 * and logs the action. Sends a DM notification before kicking where possible.
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
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the kick').setRequired(false)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.disabledTitle', loc), t('moderation.disabled', loc))] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.cannotBanSelfTitle', loc), t('cmd.kick.cannotSelf', loc))] });
      return;
    }

    if (targetUser.id === client.user?.id) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.cannotBanSelfTitle', loc), t('cmd.kick.cannotSelfBot', loc))] });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(swallow);

    if (!targetMember) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.kick.notFoundTitle', loc), t('cmd.kick.notFound', loc))] });
      return;
    }

    if (!targetMember.kickable) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.kick.hierarchyTitle', loc), t('cmd.kick.notKickable', loc))] });
      return;
    }

    if (!canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.kick.hierarchyTitle', loc), t('cmd.kick.hierarchyUser', loc))],
      });
      return;
    }

    try {
      await targetUser
        .send({
          embeds: [
            moderationEmbed({
              action: t('cmd.kick.dmAction', loc, { guild: interaction.guild.name }),
              user: targetUser.tag,
              moderator: interaction.user.tag,
              reason,
            }, settings?.moderationColor),
          ],
        })
        .catch(swallow);

      await targetMember.kick(`${reason} | Moderator: ${interaction.user.tag}`);

      const caseNumber = await getNextCaseNumber(interaction.guild.id);
      await prisma.moderationCase.create({
        data: {
          caseNumber,
          guildId: interaction.guild.id,
          type: 'kick',
          userId: targetUser.id,
          userTag: targetUser.tag,
          moderatorId: interaction.user.id,
          moderatorTag: interaction.user.tag,
          reason,
          active: false,
        },
      });

      const embed = moderationEmbed({
        action: t('cmd.kick.action', loc),
        user: `${targetUser.tag} (${targetUser.id})`,
        moderator: interaction.user.tag,
        reason,
        caseNumber,
      }, settings?.moderationColor);

      const replyMsg = await interaction.editReply({ embeds: [embed] });
      await prisma.moderationCase.update({
        where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
        data: { messageId: replyMsg.id, channelId: replyMsg.channelId },
      }).catch(swallow);

      await LoggingModule.logModerationAction(interaction.guild, {
        type: 'kick',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        guildId: interaction.guild.id,
      });
    } catch {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.kick.failedTitle', loc), t('cmd.kick.failed', loc))],
      });
    }
  },
};

export default command;
