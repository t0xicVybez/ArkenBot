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
import { canModerate } from '../../utils/permissions.js';
import { prisma } from '../../database.js';
import { getGuildSettings, getNextCaseNumber } from '../../utils/settings.js';
import { LoggingModule } from '../../modules/logging/LoggingModule.js';
import { COLORS } from '@arkenbot/shared';

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

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({
        embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')],
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'You cannot clear your own warnings.')] });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (targetMember && !canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed('Hierarchy Error', 'You cannot manage warnings for a member with a higher or equal role.')],
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
            .setTitle('✅ No Active Warnings')
            .setDescription(`${targetUser.tag} has no active warnings to clear.`),
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
            .setTitle(`Warnings Cleared in ${interaction.guild.name}`)
            .setDescription(`Your ${activeCount} active warning(s) have been cleared by a moderator.`)
            .addFields({ name: 'Reason', value: reason }),
        ],
      })
      .catch(() => null);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle('✅ Warnings Cleared')
          .addFields(
            { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: 'Cleared', value: `${activeCount} warning(s)`, inline: true },
            { name: 'Moderator', value: interaction.user.tag, inline: true },
            { name: 'Reason', value: reason },
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
