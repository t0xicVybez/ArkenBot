/**
 * /warn command — issues a warning to a member, creates a moderation case,
 * notifies the member via DM, and logs the action.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { moderationEmbed, errorEmbed, infoEmbed } from '../../utils/embed.js';
import { canModerate } from '../../utils/permissions.js';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to warn').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the warning').setRequired(true)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.ManageMessages],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'You cannot warn yourself.')] });
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
        embeds: [errorEmbed('Hierarchy Error', 'You cannot warn a member with a higher or equal role.')],
      });
      return;
    }

    await prisma.warning.create({
      data: {
        guildId: interaction.guild.id,
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
      },
    });

    const caseNumber = await getNextCaseNumber(interaction.guild.id);
    await prisma.moderationCase.create({
      data: {
        caseNumber,
        guildId: interaction.guild.id,
        type: 'warn',
        userId: targetUser.id,
        userTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        active: false,
      },
    });

    const warningCount = await prisma.warning.count({
      where: { guildId: interaction.guild.id, userId: targetUser.id, active: true },
    });

    await targetUser
      .send({
        embeds: [
          moderationEmbed({
            action: `Warning in ${interaction.guild.name}`,
            user: targetUser.tag,
            moderator: interaction.user.tag,
            reason,
          }, settings?.moderationColor),
        ],
      })
      .catch(() => null);

    // Check warning escalation thresholds stored in GuildSettings.extended
    let escalationNote = '';
    if (settings) {
      const extended = (settings.extended ?? {}) as Record<string, unknown>;
      const escalations = (extended.warnEscalation ?? []) as Array<{ count: number; action: string; duration?: number }>;
      const matched = escalations
        .filter((e) => e.count === warningCount)
        .sort((a, b) => b.count - a.count)[0];

      if (matched) {
        try {
          const muteRoleId = settings.muteRoleId;
          if (matched.action === 'mute' && muteRoleId) {
            const role = interaction.guild.roles.cache.get(muteRoleId);
            if (role) {
              await targetMember.roles.add(role, `Auto-mute: ${warningCount} warnings`).catch(() => null);
              escalationNote = `\nAuto-muted (${warningCount} warnings reached threshold).`;
            }
          } else if (matched.action === 'timeout' && matched.duration) {
            await targetMember.disableCommunicationUntil(
              Date.now() + matched.duration * 1000,
              `Auto-timeout: ${warningCount} warnings`,
            ).catch(() => null);
            escalationNote = `\nAuto-timed out for ${matched.duration}s (${warningCount} warnings reached threshold).`;
          } else if (matched.action === 'ban') {
            await interaction.guild.members.ban(targetUser, {
              reason: `Auto-ban: ${warningCount} warnings reached threshold`,
            }).catch(() => null);
            escalationNote = `\nAuto-banned (${warningCount} warnings reached threshold).`;
          } else if (matched.action === 'kick') {
            await targetMember.kick(`Auto-kick: ${warningCount} warnings`).catch(() => null);
            escalationNote = `\nAuto-kicked (${warningCount} warnings reached threshold).`;
          }
        } catch { /* escalation errors are non-fatal */ }
      }
    }

    const warnEmbed = moderationEmbed({
      action: 'Warning',
      user: `${targetUser.tag} (${targetUser.id})`,
      moderator: interaction.user.tag,
      reason: escalationNote ? `${reason}${escalationNote}` : reason,
      caseNumber,
    }, settings?.moderationColor).addFields({ name: 'Total Warnings', value: `${warningCount}`, inline: true });

    const replyMsg = await interaction.editReply({ embeds: [warnEmbed] });
    await prisma.moderationCase.update({
      where: { guildId_caseNumber: { guildId: interaction.guild.id, caseNumber } },
      data: { messageId: replyMsg.id, channelId: replyMsg.channelId },
    }).catch(() => null);

    await LoggingModule.logModerationAction(interaction.guild, {
      type: 'warn',
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      guildId: interaction.guild.id,
    });
  },
};

export default command;
