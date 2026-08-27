/** /blackjack — play a hand of blackjack against the dealer for currency. */
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type ChatInputCommandInteraction, type ButtonInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';
import { freshDeck, handValue, dealerPlay, blackjackPayout, type Card } from '../../modules/economy/games.js';

interface Game { guildId: string; userId: string; bet: number; deck: Card[]; player: Card[]; dealer: Card[]; }

// One active game per user; short-lived, cleared on resolution. Keyed by guildId:userId.
const games = new Map<string, Game>();

const show = (hand: Card[]) => hand.map((c) => `${c.rank}${c.suit}`).join(' ');
const key = (g: string, u: string) => `${g}:${u}`;

function controls(userId: string, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`blackjack:hit:${userId}`).setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`blackjack:stand:${userId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  )];
}

function tableEmbed(g: Game, loc: string, opts: { hideDealer?: boolean; color?: number; title?: string; footer?: string } = {}): EmbedBuilder {
  const dealerHand = opts.hideDealer ? `${g.dealer[0].rank}${g.dealer[0].suit} 🂠` : `${show(g.dealer)} (${handValue(g.dealer)})`;
  const embed = new EmbedBuilder().setColor(opts.color ?? COLORS.INFO)
    .setTitle(opts.title ?? t('bj.title', loc))
    .addFields(
      { name: t('bj.dealerHand', loc), value: dealerHand, inline: false },
      { name: t('bj.yourHand', loc), value: `${show(g.player)} (${handValue(g.player)})`, inline: false },
    );
  if (opts.footer) embed.setFooter({ text: opts.footer });
  return embed;
}

async function settle(interaction: ButtonInteraction, g: Game, loc: string): Promise<void> {
  dealerPlay(g.dealer, g.deck); // dealer draws to 17+ (stands on soft 17)
  const cfg = await EconomyModule.getConfigOrDefault(g.guildId);

  // Net wallet change (bet was debited up front). Credit = net + the original bet.
  const net = blackjackPayout(g.player, g.dealer, g.bet);
  const title = net > 0 ? t('bj.winTitle', loc) : net < 0 ? t('bj.loseTitle', loc) : t('bj.pushTitle', loc);
  const color = net > 0 ? COLORS.SUCCESS : net < 0 ? COLORS.ERROR : COLORS.WARNING;

  const credit = net + g.bet;
  if (credit > 0) await EconomyModule.addWallet(g.guildId, g.userId, credit, cfg.startingBalance);
  games.delete(key(g.guildId, g.userId));

  const footer = net > 0 ? t('bj.netWin', loc, { amount: EconomyModule.format(net, cfg) })
    : net < 0 ? t('bj.netLoss', loc, { amount: EconomyModule.format(-net, cfg) })
    : t('bj.netPush', loc);
  await interaction.update({ embeds: [tableEmbed(g, loc, { color, title, footer })], components: controls(g.userId, true) }).catch(() => {});
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack')
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)),
  category: 'Economy',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], ephemeral: true });
      return;
    }
    const cfg = await EconomyModule.getConfig(interaction.guild.id);
    if (!cfg?.enabled) { await interaction.reply({ embeds: [errorEmbed(t('economy.disabledTitle', loc), t('economy.disabled', loc))], ephemeral: true }); return; }
    if (!cfg.gamblingEnabled) { await interaction.reply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.gamblingDisabled', loc))], ephemeral: true }); return; }

    const bet = interaction.options.getInteger('amount', true);
    if (bet > cfg.maxBet) { await interaction.reply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.maxBet', loc, { max: EconomyModule.format(cfg.maxBet, cfg) }))], ephemeral: true }); return; }
    if (games.has(key(interaction.guild.id, interaction.user.id))) { await interaction.reply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('bj.alreadyPlaying', loc))], ephemeral: true }); return; }

    const bal = await EconomyModule.getBalance(interaction.guild.id, interaction.user.id, cfg.startingBalance);
    if (bal.wallet < bet) { await interaction.reply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.insufficientWallet', loc))], ephemeral: true }); return; }

    // Take the bet up front; payouts credit back on win/push.
    await EconomyModule.addWallet(interaction.guild.id, interaction.user.id, -bet, cfg.startingBalance);

    const deck = freshDeck();
    const g: Game = { guildId: interaction.guild.id, userId: interaction.user.id, bet, deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!] };

    // Natural blackjack resolves immediately.
    if (handValue(g.player) === 21) {
      games.set(key(g.guildId, g.userId), g);
      await interaction.reply({ embeds: [tableEmbed(g, loc)], components: controls(g.userId, true) });
      const btnLike = { update: (o: object) => interaction.editReply(o) } as unknown as ButtonInteraction;
      await settle(btnLike, g, loc);
      return;
    }
    games.set(key(g.guildId, g.userId), g);
    await interaction.reply({ embeds: [tableEmbed(g, loc, { hideDealer: true, footer: t('bj.yourMove', loc) })], components: controls(g.userId) });
  },

  async handleButton(interaction: ButtonInteraction, _client: BotClient) {
    if (!interaction.customId.startsWith('blackjack:')) return;
    const [, action, ownerId] = interaction.customId.split(':');
    const loc = await resolveUserLocale({ user: interaction.user, guildId: interaction.guildId, guildLocale: interaction.guild?.preferredLocale ?? null });
    if (interaction.user.id !== ownerId) { await interaction.reply({ content: t('bj.notYourGame', loc), ephemeral: true }).catch(() => {}); return; }
    const g = games.get(key(interaction.guildId!, ownerId));
    if (!g) { await interaction.update({ components: [] }).catch(() => {}); return; }

    if (action === 'hit') {
      g.player.push(g.deck.pop()!);
      if (handValue(g.player) >= 21) { await settle(interaction, g, loc); return; }
      await interaction.update({ embeds: [tableEmbed(g, loc, { hideDealer: true, footer: t('bj.yourMove', loc) })], components: controls(g.userId) }).catch(() => {});
    } else {
      await settle(interaction, g, loc);
    }
  },
};

export default command;
