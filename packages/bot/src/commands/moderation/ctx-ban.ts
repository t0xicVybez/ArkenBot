/**
 * "🔨 Ban Member" user context-menu command.
 * Shows a modal for reason, then bans the target if the executor outranks them.
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
import { canModerate } from '../../utils/permissions.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { prisma } from '../../database.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('🔨 Ban Member')
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.BanMembers],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const ctxInteraction = interaction as unknown as UserContextMenuCommandInteraction;
    const targetUser = ctxInteraction.targetUser;

    if (!ctxInteraction.guild) {
      const loc = await resolveUserLocale(ctxInteraction);
      await ctxInteraction.reply({ content: t('common.notInServer', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`ctx-ban:${targetUser.id}`)
      .setTitle(`Ban ${targetUser.username}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for ban')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
    await ctxInteraction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction, _client: BotClient) {
    if (!interaction.customId.startsWith('ctx-ban:')) return;
    const targetUserId = interaction.customId.split(':')[1];
    if (!targetUserId || !interaction.guild) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const loc = await resolveUserLocale(interaction);

    const reason = interaction.fields.getTextInputValue('reason');
    const guild = interaction.guild;

    const targetUser = await interaction.client.users.fetch(targetUserId).catch(swallow);
    if (!targetUser) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.ctxBan.notFoundTitle', loc), t('cmd.ctxBan.notFound', loc))] });
      return;
    }

    const moderator = await guild.members.fetch(interaction.user.id).catch(swallow);
    const targetMember = await guild.members.fetch(targetUserId).catch(swallow);

    if (moderator && targetMember && !canModerate(moderator, targetMember)) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.ctxBan.hierarchyTitle', loc), t('cmd.ctxBan.hierarchyUser', loc))] });
      return;
    }

    await guild.members.ban(targetUser, { reason: `${interaction.user.tag}: ${reason}` }).catch(swallow);

    const settings = await getGuildSettings(guild.id);
    const caseNumber = await getNextCaseNumber(guild.id);
    await prisma.moderationCase.create({
      data: {
        caseNumber,
        guildId: guild.id,
        type: 'ban',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        active: true,
      },
    });

    await targetUser.send({
      embeds: [moderationEmbed({
        action: t('cmd.ctxBan.dmAction', loc, { guild: guild.name }),
        user: targetUser.tag,
        moderator: interaction.user.tag,
        reason,
      }, settings?.moderationColor)],
    }).catch(swallow);

    await LoggingModule.logModerationAction(guild, {
      type: 'ban',
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      guildId: guild.id,
    });

    await interaction.editReply({
      embeds: [moderationEmbed({
        action: t('cmd.ctxBan.action', loc),
        user: `${targetUser.tag} (${targetUser.id})`,
        moderator: interaction.user.tag,
        reason,
        caseNumber,
      }, settings?.moderationColor)],
    });
  },
};

export default command;
