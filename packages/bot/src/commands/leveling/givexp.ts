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
import { t, resolveUserLocale } from '../../i18n/index.js';
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
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.givexp.disabledTitle', loc), t('cmd.givexp.disabled', loc))] });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);

    if (target.bot) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.givexp.invalidUserTitle', loc), t('cmd.givexp.botTarget', loc))] });
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
      ? `\n> ${t('cmd.givexp.levelUp', loc, { old: oldLevel, new: newLevel })}`
      : '';

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(t('cmd.givexp.title', loc))
      .setDescription(`${t('cmd.givexp.description', loc, { amount: amount.toLocaleString(), user: `<@${target.id}>` })}${levelUpText}`)
      .addFields(
        { name: t('cmd.givexp.fieldBefore', loc), value: t('cmd.givexp.statValue', loc, { xp: oldXp.toLocaleString(), level: oldLevel }), inline: true },
        { name: t('cmd.givexp.fieldAfter', loc), value: t('cmd.givexp.statValue', loc, { xp: newXp.toLocaleString(), level: newLevel }), inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
