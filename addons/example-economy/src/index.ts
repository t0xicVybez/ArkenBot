// @ts-nocheck
/**
 * Example Economy Addon
 *
 * A reference addon demonstrating:
 * - Multiple slash commands (balance, pay, daily, economy-leaderboard)
 * - Per-guild settings (currency name, emoji, daily reward amount)
 * - Persistent user data via AddonStorage
 * - Anti-abuse daily cooldown using timestamped storage
 *
 * Copy and adapt this addon as a starting point for your own economy system.
 */

import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { COLORS } from '@arkenbot/shared';
import { locales } from './locales.js';

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function getBalance(ctx: AddonContext, guildId: string, userId: string): Promise<number> {
  const bal = await ctx.storage.get<number>(`balance:${userId}`, guildId);
  return bal ?? 0;
}

async function setBalance(ctx: AddonContext, guildId: string, userId: string, amount: number): Promise<void> {
  // Clamp to zero so balances never go negative.
  await ctx.storage.set(`balance:${userId}`, Math.max(0, amount), guildId);
}

async function addBalance(ctx: AddonContext, guildId: string, userId: string, amount: number): Promise<number> {
  const current = await getBalance(ctx, guildId, userId);
  const newBalance = current + amount;
  await setBalance(ctx, guildId, userId, newBalance);
  return newBalance;
}

async function getCurrencyInfo(ctx: AddonContext, guildId: string): Promise<{ name: string; emoji: string; dailyAmount: number }> {
  const [name, emoji, dailyAmount] = await Promise.all([
    ctx.getSetting<string>(guildId, 'currencyName', 'Coins'),
    ctx.getSetting<string>(guildId, 'currencyEmoji', '🪙'),
    ctx.getSetting<number>(guildId, 'dailyAmount', 100),
  ]);
  return { name, emoji, dailyAmount };
}

// ─── Addon Definition ─────────────────────────────────────────────────────────

export default defineAddon({
  locales,
  manifest: {
    name: 'example-economy',
    displayName: 'Economy System',
    version: '1.0.0',
    description: 'Full economy system with currency, balance, daily rewards, and leaderboard.',
    author: 'Example Author',
    commands: ['balance', 'pay', 'daily', 'economy-leaderboard'],
    settings: [
      { key: 'currencyName', type: 'string', label: 'Currency Name', default: 'Coins' },
      { key: 'currencyEmoji', type: 'string', label: 'Currency Emoji', default: '🪙' },
      { key: 'dailyAmount', type: 'number', label: 'Daily Reward Amount', default: 100, min: 1, max: 10000 },
    ],
  },

  commands: [
    // ─── /balance ─────────────────────────────────────────────────────────────
    {
      data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your or another user\'s balance')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('The user to check').setRequired(false)
        ) as unknown as SlashCommandBuilder,
      async execute(interaction, ctx) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') ?? interaction.user;
        const loc = await ctx.resolveLocale(interaction);
        const { name, emoji } = await getCurrencyInfo(ctx, interaction.guildId);
        const balance = await getBalance(ctx, interaction.guildId, targetUser.id);

        const embed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(ctx.t('balanceTitle', loc, { emoji, name }))
          .setDescription(ctx.t('balanceDesc', loc, { tag: targetUser.tag, balance: balance.toLocaleString(), name, emoji }))
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      },
    },

    // ─── /pay ─────────────────────────────────────────────────────────────────
    {
      data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Send currency to another user')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('The user to pay').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Amount to pay').setRequired(true).setMinValue(1)
        ) as unknown as SlashCommandBuilder,
      async execute(interaction, ctx) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const opts = (interaction as ChatInputCommandInteraction).options;
        const targetUser = opts.getUser('user', true);
        const amount = opts.getInteger('amount', true);
        const loc = await ctx.resolveLocale(interaction);
        const { name, emoji } = await getCurrencyInfo(ctx, interaction.guildId);

        if (targetUser.id === interaction.user.id) {
          await interaction.editReply(ctx.t('payYourself', loc));
          return;
        }
        if (targetUser.bot) {
          await interaction.editReply(ctx.t('payBots', loc));
          return;
        }

        const senderBalance = await getBalance(ctx, interaction.guildId, interaction.user.id);
        if (senderBalance < amount) {
          await interaction.editReply(ctx.t('payInsufficient', loc, { name, balance: senderBalance.toLocaleString(), emoji }));
          return;
        }

        await setBalance(ctx, interaction.guildId, interaction.user.id, senderBalance - amount);
        const newReceiverBalance = await addBalance(ctx, interaction.guildId, targetUser.id, amount);

        const embed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(ctx.t('paySuccessTitle', loc, { emoji }))
          .setDescription(
            ctx.t('paySuccessDesc', loc, { sender: interaction.user.tag, receiver: targetUser.tag, amount: amount.toLocaleString(), name, emoji })
          )
          .addFields(
            { name: ctx.t('payFieldBalance', loc, { tag: interaction.user.tag }), value: `${(senderBalance - amount).toLocaleString()} ${emoji}`, inline: true },
            { name: ctx.t('payFieldBalance', loc, { tag: targetUser.tag }), value: `${newReceiverBalance.toLocaleString()} ${emoji}`, inline: true },
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      },
    },

    // ─── /daily ───────────────────────────────────────────────────────────────
    {
      data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily currency reward'),
      async execute(interaction, ctx) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const loc = await ctx.resolveLocale(interaction);
        const { name, emoji, dailyAmount } = await getCurrencyInfo(ctx, interaction.guildId);
        const cooldownKey = `daily_cooldown:${interaction.user.id}`;
        const lastClaim = await ctx.storage.get<number>(cooldownKey, interaction.guildId);
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        if (lastClaim && now - lastClaim < cooldown) {
          const timeLeft = Math.ceil((lastClaim + cooldown - now) / 1000 / 3600);
          const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(ctx.t('dailyClaimedTitle', loc))
            .setDescription(ctx.t('dailyClaimedDesc', loc, { hours: timeLeft }));
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        await ctx.storage.set(cooldownKey, now, interaction.guildId);
        const newBalance = await addBalance(ctx, interaction.guildId, interaction.user.id, dailyAmount);

        const embed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(ctx.t('dailyRewardTitle', loc, { emoji }))
          .setDescription(ctx.t('dailyRewardDesc', loc, { amount: dailyAmount.toLocaleString(), name, emoji, balance: newBalance.toLocaleString() }))
          .setFooter({ text: ctx.t('dailyFooter', loc) })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      },
    },

    // ─── /economy-leaderboard ─────────────────────────────────────────────────
    {
      data: new SlashCommandBuilder()
        .setName('economy-leaderboard')
        .setDescription('View the richest members'),
      async execute(interaction, ctx) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const loc = await ctx.resolveLocale(interaction);
        const { name, emoji } = await getCurrencyInfo(ctx, interaction.guildId);
        const keys = await ctx.storage.keys(interaction.guildId);
        const balanceKeys = keys.filter((k) => k.startsWith('balance:'));

        const balances = await Promise.all(
          balanceKeys.map(async (key) => {
            const userId = key.replace('balance:', '');
            const balance = await ctx.storage.get<number>(key, interaction.guildId!);
            return { userId, balance: balance ?? 0 };
          })
        );

        const sorted = balances.sort((a, b) => b.balance - a.balance).slice(0, 10);

        const medals = ['🥇', '🥈', '🥉'];
        const description = sorted.length === 0
          ? ctx.t('lbEmpty', loc)
          : sorted
            .map((entry, i) => `${medals[i] ?? `**#${i + 1}**`} <@${entry.userId}> — **${entry.balance.toLocaleString()} ${name}** ${emoji}`)
            .join('\n');

        const embed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(ctx.t('lbTitle', loc, { emoji, name }))
          .setDescription(description)
          .setFooter({ text: ctx.t('lbFooter', loc, { count: sorted.length }) })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      },
    },
  ],

  hooks: {
    async onLoad(ctx) {
      ctx.logger.info('Economy addon loaded!');
    },

    async onGuildInstall(ctx, guildId) {
      ctx.logger.info(`Economy addon installed in guild ${guildId}`);
    },

    async onUnload(ctx) {
      ctx.logger.info('Economy addon unloaded.');
    },
  },
});
