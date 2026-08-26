/** /bank deposit|withdraw — move currency between wallet and bank. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

/** Parse an amount option that also accepts the literal "all". */
function parseAmount(raw: string, max: number): number | null {
  if (raw.trim().toLowerCase() === 'all') return max;
  const n = Number(raw.replace(/[, ]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Deposit or withdraw currency')
    .addSubcommand((s) => s.setName('deposit').setDescription('Move currency from your wallet into the bank')
      .addStringOption((o) => o.setName('amount').setDescription('Amount, or "all"').setRequired(true)))
    .addSubcommand((s) => s.setName('withdraw').setDescription('Move currency from the bank into your wallet')
      .addStringOption((o) => o.setName('amount').setDescription('Amount, or "all"').setRequired(true))),
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
    const sub = interaction.options.getSubcommand();
    const raw = interaction.options.getString('amount', true);
    const guildId = interaction.guild.id;
    const bal = await EconomyModule.getBalance(guildId, interaction.user.id, cfg.startingBalance);
    const source = sub === 'deposit' ? bal.wallet : bal.bank;
    const amount = parseAmount(raw, source);
    if (amount === null || amount <= 0) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.badAmount', loc))] });
      return;
    }
    if (amount > source) {
      const msg = sub === 'deposit' ? t('economy.insufficientWallet', loc) : t('economy.insufficientBank', loc);
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), msg)] });
      return;
    }
    const data = sub === 'deposit'
      ? { wallet: { decrement: amount }, bank: { increment: amount } }
      : { wallet: { increment: amount }, bank: { decrement: amount } };
    const updated = await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data });
    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(t(sub === 'deposit' ? 'economy.depositTitle' : 'economy.withdrawTitle', loc))
      .setDescription(t(sub === 'deposit' ? 'economy.depositDesc' : 'economy.withdrawDesc', loc, { amount: EconomyModule.format(amount, cfg) }))
      .addFields(
        { name: t('economy.wallet', loc), value: EconomyModule.format(updated.wallet, cfg), inline: true },
        { name: t('economy.bank', loc), value: EconomyModule.format(updated.bank, cfg), inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
