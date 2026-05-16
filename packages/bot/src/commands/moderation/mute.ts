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
import { canModerate } from '../../utils/permissions.js';
import { parseDuration, formatDuration } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

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

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const durationSeconds = parseDuration(durationStr);
    if (!durationSeconds) {
      await interaction.editReply({
        embeds: [errorEmbed('Invalid Duration', 'Use formats like `10m`, `1h`, `1d`. Maximum is 28 days.')],
      });
      return;
    }

    const maxTimeout = 28 * 24 * 60 * 60; // Discord enforces a 28-day maximum for timeouts.
    if (durationSeconds > maxTimeout) {
      await interaction.editReply({
        embeds: [errorEmbed('Too Long', 'Discord timeout maximum is 28 days.')],
      });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      await interaction.editReply({ embeds: [errorEmbed('Not Found', 'That user is not in this server.')] });
      return;
    }

    if (!canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed('Hierarchy Error', 'You cannot mute a member with a higher or equal role.')],
      });
      return;
    }

    if (!targetMember.moderatable) {
      await interaction.editReply({ embeds: [errorEmbed('Hierarchy Error', 'I cannot mute this member.')] });
      return;
    }

    try {
      const expiresAt = new Date(Date.now() + durationSeconds * 1000);

      await targetUser
        .send({
          embeds: [
            moderationEmbed({
              action: `Muted in ${interaction.guild.name}`,
              user: targetUser.tag,
              moderator: interaction.user.tag,
              reason,
              duration: formatDuration(durationSeconds),
            }, settings?.moderationColor),
          ],
        })
        .catch(() => null);

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
            action: 'Mute',
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
      }).catch(() => null);

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
      await interaction.editReply({ embeds: [errorEmbed('Failed', 'I could not mute that member.')] });
    }
  },
};

export default command;
