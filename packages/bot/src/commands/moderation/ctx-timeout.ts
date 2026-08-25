/**
 * "⏱ Timeout Member" user context-menu command.
 * Shows a modal for duration + reason, then applies a Discord timeout.
 */
import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type UserContextMenuCommandInteraction,
  type ModalSubmitInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { moderationEmbed, errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { AppealsModule } from '../../modules/moderation/AppealsModule.js';
import { canModerate } from '../../utils/permissions.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { prisma } from '../../database.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

import { swallow } from '../../logger.js';
function parseDuration(str: string): number | null {
  const match = str.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (unit[match[2].toLowerCase()] ?? 0);
}

const command: BotCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('⏱ Timeout Member')
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const ctxInteraction = interaction as unknown as UserContextMenuCommandInteraction;
    const targetUser = ctxInteraction.targetUser;

    if (!ctxInteraction.guild) {
      const loc = await resolveUserLocale(ctxInteraction);
      await ctxInteraction.reply({ content: t('common.notInServer', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const loc = await resolveUserLocale(ctxInteraction);
    const modal = new ModalBuilder()
      .setCustomId(`ctx-timeout:${targetUser.id}`)
      .setTitle(t('cmd.ctxTimeout.modalTitle', loc, { user: targetUser.username }));

    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel(t('cmd.ctxTimeout.modalDurationLabel', loc))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('1h');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel(t('cmd.ctxTimeout.modalReasonLabel', loc))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    );
    await ctxInteraction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction, _client: BotClient) {
    if (!interaction.customId.startsWith('ctx-timeout:')) return;
    const targetUserId = interaction.customId.split(':')[1];
    if (!targetUserId || !interaction.guild) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const loc = await resolveUserLocale(interaction);

    const durationStr = interaction.fields.getTextInputValue('duration');
    const reason = interaction.fields.getTextInputValue('reason');
    const ms = parseDuration(durationStr);

    if (!ms || ms < 5000 || ms > 28 * 24 * 60 * 60 * 1000) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.ctxTimeout.invalidDurationTitle', loc), t('cmd.ctxTimeout.invalidDuration', loc))] });
      return;
    }

    const guild = interaction.guild;
    const targetUser = await interaction.client.users.fetch(targetUserId).catch(swallow);
    if (!targetUser) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.ctxTimeout.notFoundTitle', loc), t('cmd.ctxTimeout.notFoundUser', loc))] });
      return;
    }

    const moderator = await guild.members.fetch(interaction.user.id).catch(swallow);
    const targetMember = await guild.members.fetch(targetUserId).catch(swallow);

    if (!targetMember) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.ctxTimeout.notFoundTitle', loc), t('cmd.ctxTimeout.notInServer', loc))] });
      return;
    }

    if (moderator && !canModerate(moderator, targetMember)) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.ctxTimeout.hierarchyTitle', loc), t('cmd.ctxTimeout.hierarchyUser', loc))] });
      return;
    }

    await targetMember.disableCommunicationUntil(Date.now() + ms, reason).catch(swallow);

    const settings = await getGuildSettings(guild.id);
    const caseNumber = await getNextCaseNumber(guild.id);
    await prisma.moderationCase.create({
      data: {
        caseNumber,
        guildId: guild.id,
        type: 'mute',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        active: true,
      },
    });

    const durationLabel = durationStr.toLowerCase();
    const appealsOn = await AppealsModule.enabled(guild.id);
    const targetLoc = await resolveUserLocale({ user: { id: targetUser.id }, guildId: guild.id, guildLocale: guild.preferredLocale });
    await targetUser.send({
      embeds: [moderationEmbed({
        action: t('cmd.ctxTimeout.dmAction', loc, { guild: guild.name }),
        user: targetUser.tag,
        moderator: interaction.user.tag,
        reason,
        duration: durationLabel,
      }, settings?.moderationColor)],
      components: appealsOn ? [AppealsModule.appealButton(guild.id, 'mute', targetLoc)] : [],
    }).catch(swallow);

    await LoggingModule.logModerationAction(guild, {
      type: 'mute',
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      guildId: guild.id,
    });

    await interaction.editReply({
      embeds: [moderationEmbed({
        action: t('cmd.ctxTimeout.action', loc),
        user: `${targetUser.tag} (${targetUser.id})`,
        moderator: interaction.user.tag,
        reason,
        duration: durationLabel,
        caseNumber,
      }, settings?.moderationColor)],
    });
  },
};

export default command;
