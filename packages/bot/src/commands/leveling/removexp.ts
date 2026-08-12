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
import { t, resolveUserLocale } from '../../i18n/index.js';
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
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.removexp.disabledTitle', loc), t('cmd.removexp.disabled', loc))] });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);

    if (target.bot) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.removexp.invalidUserTitle', loc), t('cmd.removexp.botTarget', loc))] });
      return;
    }

    const existing = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: target.id } },
    });

    if (!existing) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.removexp.noDataTitle', loc), t('cmd.removexp.noData', loc, { user: `<@${target.id}>` }))] });
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
      ? `\n> ${t('cmd.removexp.levelDown', loc, { old: oldLevel, new: newLevel })}`
      : '';

    const actualRemoved = oldXp - newXp;

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(t('cmd.removexp.title', loc))
      .setDescription(`${t('cmd.removexp.description', loc, { amount: actualRemoved.toLocaleString(), user: `<@${target.id}>` })}${levelDownText}`)
      .addFields(
        { name: t('cmd.removexp.fieldBefore', loc), value: t('cmd.removexp.statValue', loc, { xp: oldXp.toLocaleString(), level: oldLevel }), inline: true },
        { name: t('cmd.removexp.fieldAfter', loc), value: t('cmd.removexp.statValue', loc, { xp: newXp.toLocaleString(), level: newLevel }), inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
