/**
 * /clearwarnings command — deactivates all active warnings for a member,
 * records a clearwarn case, and notifies the member via DM.
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
import { t, resolveUserLocale } from '../../i18n/index.js';
import { canModerate } from '../../utils/permissions.js';
import { prisma } from '../../database.js';
import { getGuildSettings, getNextCaseNumber } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';
import { COLORS } from '@arkenbot/shared';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to clear warnings for').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('Reason for clearing warnings')
        .setRequired(false)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.ManageMessages],

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

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.cannotBanSelfTitle', loc), t('cmd.clearwarnings.cannotSelf', loc))] });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(swallow);

    if (targetMember && !canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.clearwarnings.hierarchyTitle', loc), t('cmd.clearwarnings.hierarchyUser', loc))],
      });
      return;
    }

    const activeCount = await prisma.warning.count({
      where: { guildId: interaction.guild.id, userId: targetUser.id, active: true },
    });

    if (activeCount === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(t('cmd.clearwarnings.noActiveTitle', loc))
            .setDescription(t('cmd.clearwarnings.noActive', loc, { user: targetUser.tag })),
        ],
      });
      return;
    }

    await prisma.warning.updateMany({
      where: { guildId: interaction.guild.id, userId: targetUser.id, active: true },
      data: { active: false },
    });

    const caseNumber = await getNextCaseNumber(interaction.guild.id);
    await prisma.moderationCase.create({
      data: {
        caseNumber,
        guildId: interaction.guild.id,
        type: 'clearwarn',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason: `[Clear Warnings] ${reason} (cleared ${activeCount} warning(s))`,
        active: false,
      },
    });

    await targetUser
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(t('cmd.clearwarnings.dmTitle', loc, { guild: interaction.guild.name }))
            .setDescription(t('cmd.clearwarnings.dmDesc', loc, { count: activeCount }))
            .addFields({ name: t('cmd.clearwarnings.fieldReason', loc), value: reason }),
        ],
      })
      .catch(swallow);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(t('cmd.clearwarnings.clearedTitle', loc))
          .addFields(
            { name: t('cmd.clearwarnings.fieldUser', loc), value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: t('cmd.clearwarnings.fieldCleared', loc), value: t('cmd.clearwarnings.clearedValue', loc, { count: activeCount }), inline: true },
            { name: t('cmd.clearwarnings.fieldModerator', loc), value: interaction.user.tag, inline: true },
            { name: t('cmd.clearwarnings.fieldReason', loc), value: reason },
          ),
      ],
    });

    await LoggingModule.logModerationAction(interaction.guild, {
      type: 'warn',
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason: `[Clear Warnings] ${reason} (cleared ${activeCount} warning(s))`,
      guildId: interaction.guild.id,
    });
  },
};

export default command;
