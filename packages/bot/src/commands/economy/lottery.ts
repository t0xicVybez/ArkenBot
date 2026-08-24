/** /lottery buy|info — a weekly server raffle; winner takes the whole pot. */
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
    .setName('lottery')
    .setDescription('Buy tickets for the weekly server lottery')
    .addSubcommand((s) => s.setName('buy').setDescription('Buy lottery tickets')
      .addIntegerOption((o) => o.setName('tickets').setDescription('How many tickets').setRequired(true).setMinValue(1).setMaxValue(1000)))
    .addSubcommand((s) => s.setName('info').setDescription('Show the current pot and your tickets')),
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
    if (!cfg.lotteryEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('lottery.disabled', loc))] });
      return;
    }
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'info') {
      const rows = await prisma.economyLotteryTicket.findMany({ where: { guildId } });
      const totalTickets = rows.reduce((s, r) => s + r.tickets, 0);
      const mine = rows.find((r) => r.userId === interaction.user.id)?.tickets ?? 0;
      const pot = totalTickets * cfg.lotteryTicketPrice;
      const odds = totalTickets > 0 ? Math.round((mine / totalTickets) * 100) : 0;
      const embed = new EmbedBuilder().setColor(COLORS.WARNING).setTitle(t('lottery.infoTitle', loc))
        .addFields(
          { name: t('lottery.pot', loc), value: EconomyModule.format(pot, cfg), inline: true },
          { name: t('lottery.ticketPrice', loc), value: EconomyModule.format(cfg.lotteryTicketPrice, cfg), inline: true },
          { name: t('lottery.totalTickets', loc), value: totalTickets.toLocaleString(), inline: true },
          { name: t('lottery.yourTickets', loc), value: `${mine.toLocaleString()} (${odds}%)`, inline: true },
        )
        .setFooter({ text: t('lottery.drawFooter', loc) }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // buy
    const count = interaction.options.getInteger('tickets', true);
    const cost = count * cfg.lotteryTicketPrice;
    const bal = await EconomyModule.getBalance(guildId, interaction.user.id, cfg.startingBalance);
    if (bal.wallet < cost) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.insufficientWallet', loc))] });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data: { wallet: { decrement: cost } } });
      await tx.economyLotteryTicket.upsert({
        where: { guildId_userId: { guildId, userId: interaction.user.id } },
        create: { guildId, userId: interaction.user.id, userTag: interaction.user.tag, tickets: count },
        update: { tickets: { increment: count }, userTag: interaction.user.tag },
      });
    });
    const embed = new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('lottery.boughtTitle', loc))
      .setDescription(t('lottery.bought', loc, { count: String(count), cost: EconomyModule.format(cost, cfg) })).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
