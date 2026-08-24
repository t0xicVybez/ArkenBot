/** /pay — transfer wallet currency to another member (atomic, no negatives). */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send currency from your wallet to another member')
    .addUserOption((o) => o.setName('user').setDescription('Who to pay').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How much to send').setRequired(true).setMinValue(1)),
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
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (target.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.payYourself', loc))] });
      return;
    }
    if (target.bot) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.noBots', loc))] });
      return;
    }
    const guildId = interaction.guild.id;
    await EconomyModule.getBalance(guildId, interaction.user.id, cfg.startingBalance);
    await EconomyModule.getBalance(guildId, target.id, cfg.startingBalance);
    try {
      await prisma.$transaction(async (tx) => {
        const sender = await tx.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId: interaction.user.id } } });
        if (!sender || sender.wallet < amount) throw new Error('INSUFFICIENT');
        await tx.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data: { wallet: { decrement: amount } } });
        await tx.economyBalance.update({ where: { guildId_userId: { guildId, userId: target.id } }, data: { wallet: { increment: amount } } });
      });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.insufficientWallet', loc))] });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(t('economy.payTitle', loc))
      .setDescription(t('economy.payDesc', loc, { amount: EconomyModule.format(amount, cfg), user: `<@${target.id}>` }))
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
