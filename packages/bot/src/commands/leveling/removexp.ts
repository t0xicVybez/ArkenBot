/**
 * /removexp command — deducts XP from a member, clamping to zero, and
 * recalculates their level. Restricted to members with the Manage Guild permission.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS, levelFromXp } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('removexp')
    .setDescription('Remove XP from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to remove XP from').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Amount of XP to remove').setMinValue(1).setMaxValue(1000000).setRequired(true)
    ),
  category: 'leveling',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Leveling Disabled', 'The leveling system is disabled for this server.')] });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);

    if (target.bot) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid User', 'You cannot remove XP from a bot.')] });
      return;
    }

    const existing = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: target.id } },
    });

    if (!existing) {
      await interaction.editReply({ embeds: [errorEmbed('No Data', `<@${target.id}> has no XP in this server.`)] });
      return;
    }

    const oldXp = existing.xp;
    const oldLevel = existing.level;
    const newXp = Math.max(0, oldXp - amount);
    const newLevel = levelFromXp(newXp);

    await prisma.userLevel.update({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: target.id } },
      data: { xp: newXp, level: newLevel },
    });

    const levelDownText = newLevel < oldLevel
      ? `\n> They dropped from Level **${oldLevel}** → **${newLevel}**.`
      : '';

    const actualRemoved = oldXp - newXp;

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('XP Removed')
      .setDescription(`Removed **${actualRemoved.toLocaleString()} XP** from <@${target.id}>.${levelDownText}`)
      .addFields(
        { name: 'Before', value: `${oldXp.toLocaleString()} XP (Level ${oldLevel})`, inline: true },
        { name: 'After', value: `${newXp.toLocaleString()} XP (Level ${newLevel})`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
