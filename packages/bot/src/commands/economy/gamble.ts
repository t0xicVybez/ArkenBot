/** /gamble coinflip|slots|dice|roulette|highlow — wager wallet currency on a minigame. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';
import * as games from '../../modules/economy/games.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Wager your currency on a game of chance')
    .addSubcommand((s) => s.setName('coinflip').setDescription('Flip a coin — win pays 0.95:1')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('side').setDescription('Heads or tails').setRequired(true)
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })))
    .addSubcommand((s) => s.setName('slots').setDescription('Spin the slot machine')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('dice').setDescription('Beat the house roll (2 dice)')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('roulette').setDescription('Bet on red, black, green or a number (0–36)')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('bet').setDescription('"red", "black", "green" or a number 0–36').setRequired(true)))
    .addSubcommand((s) => s.setName('highlow').setDescription('Guess if the next number (1–100) is higher or lower')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('guess').setDescription('Higher or lower').setRequired(true)
        .addChoices({ name: 'Higher', value: 'higher' }, { name: 'Lower', value: 'lower' }))),
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
    if (!cfg.gamblingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.gamblingDisabled', loc))] });
      return;
    }
    const bet = interaction.options.getInteger('amount', true);
    if (bet > cfg.maxBet) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.maxBet', loc, { max: EconomyModule.format(cfg.maxBet, cfg) }))] });
      return;
    }
    const guildId = interaction.guild.id;
    const bal = await EconomyModule.getBalance(guildId, interaction.user.id, cfg.startingBalance);
    if (bal.wallet < bet) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.insufficientWallet', loc))] });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const won = (amount: number) => t('economy.wonAmount', loc, { amount: EconomyModule.format(amount, cfg) });
    const lost = () => t('economy.lostAmount', loc, { amount: EconomyModule.format(bet, cfg) });

    let delta = 0;
    let title = '';
    let desc = '';

    if (sub === 'coinflip') {
      const r = games.coinflip(bet, interaction.options.getString('side', true) as 'heads' | 'tails');
      delta = r.delta;
      title = t(r.won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      desc = t('economy.coinflipResult', loc, { result: t(`economy.coin.${r.flip}`, loc), outcome: r.won ? won(delta) : lost() });
    } else if (sub === 'slots') {
      const r = games.slots(bet);
      delta = r.delta;
      title = t(r.won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      desc = `**${r.reels.join(' | ')}**\n\n` + (r.won ? won(delta) : lost());
    } else if (sub === 'dice') {
      const r = games.dice(bet);
      delta = r.delta;
      title = t(r.tie ? 'economy.gambleTieTitle' : r.won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      const outcome = r.tie ? t('economy.pushAmount', loc) : r.won ? won(delta) : lost();
      desc = t('economy.diceResult', loc, { you: String(r.you), house: String(r.house), outcome });
    } else if (sub === 'roulette') {
      const r = games.roulette(bet, interaction.options.getString('bet', true));
      if (!r.valid) {
        await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.rouletteBadBet', loc))] });
        return;
      }
      delta = r.delta;
      title = t(r.won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      desc = t('economy.rouletteResult', loc, { pocket: String(r.pocket), color: t(`economy.roulette.${r.color}`, loc), outcome: r.won ? won(delta) : lost() });
    } else {
      const r = games.highlow(bet, interaction.options.getString('guess', true) as 'higher' | 'lower');
      delta = r.delta;
      title = t(r.won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      desc = t('economy.highlowResult', loc, { base: String(r.base), next: String(r.next), outcome: r.won ? won(delta) : lost() });
    }

    let updated = bal;
    if (delta !== 0) {
      updated = await prisma.economyBalance.update({
        where: { guildId_userId: { guildId, userId: interaction.user.id } },
        data: { wallet: { increment: delta } },
      });
    }
    const color = delta > 0 ? COLORS.SUCCESS : delta < 0 ? COLORS.ERROR : COLORS.NEUTRAL;
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc)
      .setFooter({ text: t('economy.newWallet', loc, { amount: EconomyModule.format(updated.wallet, cfg) }) })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
