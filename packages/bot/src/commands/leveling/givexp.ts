/**
 * /givexp command — grants a specified amount of XP to a member and applies
 * any resulting level-up. Restricted to members with the Manage Guild permission.
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
    .setName('givexp')
    .setDescription('Give XP to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to give XP to').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Amount of XP to give').setMinValue(1).setMaxValue(1000000).setRequired(true)
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
      await interaction.editReply({ embeds: [errorEmbed('Invalid User', 'You cannot give XP to a bot.')] });
      return;
    }

    const existing = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: target.id } },
    });

    const oldXp = existing?.xp ?? 0;
    const newXp = oldXp + amount;
    const oldLevel = existing?.level ?? 0;
    const newLevel = levelFromXp(newXp);

    await prisma.userLevel.upsert({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: target.id } },
      update: { xp: newXp, level: newLevel, userTag: target.tag },
      create: {
        guildId: interaction.guild.id,
        userId: target.id,
        userTag: target.tag,
        xp: newXp,
        level: newLevel,
        totalMessages: 0,
      },
    });

    const levelUpText = newLevel > oldLevel
      ? `\n> They leveled up from **${oldLevel}** → **${newLevel}**!`
      : '';

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('XP Given')
      .setDescription(`Gave **${amount.toLocaleString()} XP** to <@${target.id}>.${levelUpText}`)
      .addFields(
        { name: 'Before', value: `${oldXp.toLocaleString()} XP (Level ${oldLevel})`, inline: true },
        { name: 'After', value: `${newXp.toLocaleString()} XP (Level ${newLevel})`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
