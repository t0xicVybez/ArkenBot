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
import { canModerate } from '../../utils/permissions.js';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

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

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'You cannot kick yourself.')] });
      return;
    }

    if (targetUser.id === client.user?.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'I cannot kick myself.')] });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      await interaction.editReply({ embeds: [errorEmbed('Not Found', 'That user is not in this server.')] });
      return;
    }

    if (!targetMember.kickable) {
      await interaction.editReply({ embeds: [errorEmbed('Hierarchy Error', 'I cannot kick this member.')] });
      return;
    }

    if (!canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed('Hierarchy Error', 'You cannot kick a member with a higher or equal role.')],
      });
      return;
    }

    try {
      await targetUser
        .send({
          embeds: [
            moderationEmbed({
              action: `Kicked from ${interaction.guild.name}`,
              user: targetUser.tag,
              moderator: interaction.user.tag,
              reason,
            }, settings?.moderationColor),
          ],
        })
        .catch(() => null);

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
        action: 'Kick',
        user: `${targetUser.tag} (${targetUser.id})`,
        moderator: interaction.user.tag,
        reason,
        caseNumber,
      }, settings?.moderationColor);

      const replyMsg = await interaction.editReply({ embeds: [embed] });
      await prisma.moderationCase.update({
        where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
        data: { messageId: replyMsg.id, channelId: replyMsg.channelId },
      }).catch(() => null);

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
        embeds: [errorEmbed('Failed', 'I could not kick that member. Check my permissions.')],
      });
    }
  },
};

export default command;
