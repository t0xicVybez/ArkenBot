/** /gamble coinflip|slots|dice — wager wallet currency on a minigame. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎'];

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Wager your currency on a game of chance')
    .addSubcommand((s) => s.setName('coinflip').setDescription('Flip a coin — double or nothing')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('side').setDescription('Heads or tails').setRequired(true)
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })))
    .addSubcommand((s) => s.setName('slots').setDescription('Spin the slot machine')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('dice').setDescription('Beat the house roll (2 dice)')
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1))),
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

    let delta = 0; // net change to wallet (bet already "held")
    let title = '';
    let desc = '';

    if (sub === 'coinflip') {
      const side = interaction.options.getString('side', true);
      const flip = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = flip === side;
      delta = won ? bet : -bet;
      title = t(won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      desc = t('economy.coinflipResult', loc, {
        result: t(`economy.coin.${flip}`, loc),
        outcome: won ? t('economy.wonAmount', loc, { amount: EconomyModule.format(bet, cfg) })
                     : t('economy.lostAmount', loc, { amount: EconomyModule.format(bet, cfg) }),
      });
    } else if (sub === 'slots') {
      const reels = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
      const [a, b, c] = reels;
      let mult = -1;
      if (a === b && b === c) mult = a === '💎' ? 9 : 4;      // triple (jackpot on diamonds)
      else if (a === b || b === c || a === c) mult = 1;        // any pair returns the stake + equal
      delta = bet * mult;
      const won = delta > 0;
      title = t(won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      const line = `${a} | ${b} | ${c}`;
      desc = `**${line}**\n\n` + (won
        ? t('economy.wonAmount', loc, { amount: EconomyModule.format(delta, cfg) })
        : t('economy.lostAmount', loc, { amount: EconomyModule.format(bet, cfg) }));
    } else {
      const roll = () => (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6));
      const you = roll();
      const house = roll();
      const won = you > house;
      const tie = you === house;
      delta = tie ? 0 : won ? bet : -bet;
      title = t(tie ? 'economy.gambleTieTitle' : won ? 'economy.gambleWinTitle' : 'economy.gambleLoseTitle', loc);
      const outcome = tie ? t('economy.pushAmount', loc)
        : won ? t('economy.wonAmount', loc, { amount: EconomyModule.format(bet, cfg) })
              : t('economy.lostAmount', loc, { amount: EconomyModule.format(bet, cfg) });
      desc = t('economy.diceResult', loc, { you: String(you), house: String(house), outcome });
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
