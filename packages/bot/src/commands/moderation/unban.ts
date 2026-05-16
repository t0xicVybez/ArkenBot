/**
 * /unban command — lifts a ban by user ID, resolves any active ban cases,
 * and records a new unban case.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed, errorEmbed } from '../../utils/embed.js';
import { prisma } from '../../database.js';
import { getNextCaseNumber, getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((opt) =>
      opt.setName('user_id').setDescription('The user ID to unban').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for unban').setRequired(false)
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid ID', 'Please provide a valid Discord user ID.')] });
      return;
    }

    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        await interaction.editReply({ embeds: [errorEmbed('Not Banned', 'That user is not banned from this server.')] });
        return;
      }

      await interaction.guild.members.unban(userId, `${reason} | Moderator: ${interaction.user.tag}`);

      // Mark existing active ban/tempban cases as resolved so dashboards reflect the change.
      await prisma.moderationCase.updateMany({
        where: {
          guildId: interaction.guild.id,
          userId,
          type: { in: ['ban', 'tempban'] },
          active: true,
        },
        data: { active: false },
      });

      const caseNumber = await getNextCaseNumber(interaction.guild.id);
      await prisma.moderationCase.create({
        data: {
          caseNumber,
          guildId: interaction.guild.id,
          type: 'unban',
          userId,
          userTag: ban.user.tag,
          moderatorId: interaction.user.id,
          moderatorTag: interaction.user.tag,
          reason,
          active: false,
        },
      });

      await interaction.editReply({
        embeds: [successEmbed('Unbanned', `Successfully unbanned **${ban.user.tag}** (${userId})\n**Reason:** ${reason}`)],
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('Failed', 'Could not unban that user.')] });
    }
  },
};

export default command;
