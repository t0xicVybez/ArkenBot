/** /daily — claim a once-per-day reward with a consecutive-day streak bonus. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const command: BotCommand = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),
  category: 'Economy',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }
    const cfg = await EconomyModule.getConfig(interaction.guild.id);
    if (!cfg?.enabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.disabledTitle', loc), t('economy.disabled', loc))] });
      return;
    }
    const bal = await EconomyModule.getBalance(interaction.guild.id, interaction.user.id, cfg.startingBalance);
    const now = Date.now();
    const remaining = EconomyModule.cooldownRemaining(bal.lastDaily, 24 * 60 * 60, now);
    if (remaining > 0) {
      await interaction.editReply({
        embeds: [errorEmbed(t('economy.dailyWaitTitle', loc), t('economy.dailyWait', loc, { time: EconomyModule.readyTag(remaining, now) }))],
      });
      return;
    }
    // Streak continues only if the last claim was inside the previous 48h window.
    const withinStreak = bal.lastDaily ? now - bal.lastDaily.getTime() < 2 * DAY_MS : false;
    const streak = withinStreak ? bal.dailyStreak + 1 : 1;
    const streakBonus = Math.min(streak - 1, 6) * cfg.dailyStreakBonus;

    // Income roles: a passive bonus for members holding configured roles.
    const roleIds = interaction.member && 'roles' in interaction.member
      ? Array.from((interaction.member.roles as { cache: Map<string, unknown> }).cache?.keys?.() ?? [])
      : [];
    const income = await EconomyModule.incomeForRoles(interaction.guild.id, roleIds as string[]);

    // Bank interest: a daily percentage on whatever is banked, capped by config.
    const interest = EconomyModule.bankInterest(bal.bank, cfg);

    const total = cfg.dailyAmount + streakBonus + income;
    await prisma.economyBalance.update({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: interaction.user.id } },
      data: { wallet: { increment: total }, bank: { increment: interest }, lastDaily: new Date(now), dailyStreak: streak },
    });
    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(t('economy.dailyTitle', loc))
      .setDescription(t('economy.dailyDesc', loc, { amount: EconomyModule.format(total, cfg) }))
      .addFields(
        { name: t('economy.streak', loc), value: t('economy.streakDays', loc, { days: String(streak) }), inline: true },
        { name: t('economy.streakBonus', loc), value: EconomyModule.format(streakBonus, cfg), inline: true },
      );
    if (income > 0) embed.addFields({ name: t('economy.incomeRoles', loc), value: EconomyModule.format(income, cfg), inline: true });
    if (interest > 0) embed.addFields({ name: t('economy.bankInterest', loc), value: EconomyModule.format(interest, cfg), inline: true });
    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
