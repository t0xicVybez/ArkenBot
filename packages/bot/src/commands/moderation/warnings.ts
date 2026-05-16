/**
 * /warnings command — lists up to 10 warnings for a member, optionally
 * including previously cleared warnings.
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
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { COLORS } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to check').setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt.setName('include_cleared').setDescription('Include cleared warnings').setRequired(false)
    ),
  category: 'moderation',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Moderation Disabled', 'Moderation commands are disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const includeCleared = interaction.options.getBoolean('include_cleared') ?? false;

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const warnings = await prisma.warning.findMany({
      where: {
        guildId: interaction.guild.id,
        userId: targetUser.id,
        ...(includeCleared ? {} : { active: true }),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (warnings.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('✅ No Warnings')
            .setDescription(`${targetUser.tag} has no ${includeCleared ? '' : 'active '}warnings.`),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(`⚠️ Warnings for ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        warnings
          .map(
            (w, i) =>
              `**${i + 1}.** ${w.reason}\n> By <@${w.moderatorId}> on <t:${Math.floor(w.createdAt.getTime() / 1000)}:d>${
                !w.active ? ' ~~(cleared)~~' : ''
              }`
          )
          .join('\n\n')
      )
      .setFooter({ text: `Showing ${warnings.length} warning(s)` });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
