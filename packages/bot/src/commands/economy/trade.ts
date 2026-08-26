/** /trade — offer coins and/or an owned item to another member, who must accept. */
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type ChatInputCommandInteraction, type ButtonInteraction, type AutocompleteInteraction,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

interface Offer { guildId: string; senderId: string; recipientId: string; coins: number; itemId: string | null; itemName: string | null; }
const offers = new Map<string, Offer>();

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer coins and/or an item to another member')
    .addUserOption((o) => o.setName('user').setDescription('Who to trade with').setRequired(true))
    .addIntegerOption((o) => o.setName('coins').setDescription('Coins to offer').setRequired(false).setMinValue(0))
    .addStringOption((o) => o.setName('item').setDescription('An item from your inventory').setRequired(false).setAutocomplete(true)),
  category: 'Economy',

  async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
    if (!interaction.guildId) return interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const items = await prisma.economyInventory.findMany({ where: { guildId: interaction.guildId, userId: interaction.user.id }, take: 25 });
    await interaction.respond(items.filter((i) => i.itemName.toLowerCase().includes(focused)).slice(0, 25).map((i) => ({ name: `${i.itemName} (×${i.quantity})`, value: i.itemId })));
  },

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) { await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] }); return; }
    const cfg = await EconomyModule.getConfig(interaction.guild.id);
    if (!cfg?.enabled) { await interaction.editReply({ embeds: [errorEmbed(t('economy.disabledTitle', loc), t('economy.disabled', loc))] }); return; }

    const recipient = interaction.options.getUser('user', true);
    const coins = interaction.options.getInteger('coins') ?? 0;
    const itemId = interaction.options.getString('item');
    if (recipient.id === interaction.user.id) { await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('trade.self', loc))] }); return; }
    if (recipient.bot) { await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.noBots', loc))] }); return; }
    if (coins <= 0 && !itemId) { await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('trade.empty', loc))] }); return; }

    // Validate the sender can back the offer right now (re-checked on accept).
    const bal = await EconomyModule.getBalance(interaction.guild.id, interaction.user.id, cfg.startingBalance);
    if (coins > bal.wallet) { await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.insufficientWallet', loc))] }); return; }
    let itemName: string | null = null;
    if (itemId) {
      const inv = await prisma.economyInventory.findUnique({ where: { guildId_userId_itemId: { guildId: interaction.guild.id, userId: interaction.user.id, itemId } } });
      if (!inv || inv.quantity < 1) { await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('trade.noItem', loc))] }); return; }
      itemName = inv.itemName;
    }

    const tradeId = randomUUID().slice(0, 8);
    offers.set(tradeId, { guildId: interaction.guild.id, senderId: interaction.user.id, recipientId: recipient.id, coins, itemId: itemId ?? null, itemName });
    setTimeout(() => offers.delete(tradeId), 120_000);

    const parts: string[] = [];
    if (coins > 0) parts.push(EconomyModule.format(coins, cfg));
    if (itemName) parts.push(`**${itemName}**`);
    const embed = new EmbedBuilder().setColor(COLORS.INFO).setTitle(t('trade.title', loc))
      .setDescription(t('trade.offer', loc, { sender: `<@${interaction.user.id}>`, recipient: `<@${recipient.id}>`, offer: parts.join(' + ') }))
      .setFooter({ text: t('trade.expires', loc) }).setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`trade:accept:${tradeId}`).setLabel(t('trade.accept', loc)).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade:decline:${tradeId}`).setLabel(t('trade.decline', loc)).setStyle(ButtonStyle.Danger),
    );
    await interaction.editReply({ content: `<@${recipient.id}>`, embeds: [embed], components: [row], allowedMentions: { users: [recipient.id] } });
  },

  async handleButton(interaction: ButtonInteraction, _client: BotClient) {
    if (!interaction.customId.startsWith('trade:')) return;
    const [, action, tradeId] = interaction.customId.split(':');
    const loc = await resolveUserLocale({ user: interaction.user, guildId: interaction.guildId, guildLocale: interaction.guild?.preferredLocale ?? null });
    const offer = offers.get(tradeId);
    if (!offer) { await interaction.update({ components: [] }).catch(() => {}); return; }
    if (interaction.user.id !== offer.recipientId) { await interaction.reply({ content: t('trade.notYours', loc), ephemeral: true }).catch(() => {}); return; }

    if (action === 'decline') {
      offers.delete(tradeId);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(COLORS.ERROR).setTitle(t('trade.declinedTitle', loc)).setDescription(t('trade.declined', loc))], components: [] }).catch(() => {});
      return;
    }

    // Accept — re-validate and move atomically.
    const cfg = await EconomyModule.getConfigOrDefault(offer.guildId);
    try {
      await prisma.$transaction(async (tx) => {
        const sender = await tx.economyBalance.findUnique({ where: { guildId_userId: { guildId: offer.guildId, userId: offer.senderId } } });
        if (offer.coins > 0 && (!sender || sender.wallet < offer.coins)) throw new Error('COINS');
        if (offer.itemId) {
          const inv = await tx.economyInventory.findUnique({ where: { guildId_userId_itemId: { guildId: offer.guildId, userId: offer.senderId, itemId: offer.itemId } } });
          if (!inv || inv.quantity < 1) throw new Error('ITEM');
          if (inv.quantity === 1) await tx.economyInventory.delete({ where: { id: inv.id } });
          else await tx.economyInventory.update({ where: { id: inv.id }, data: { quantity: { decrement: 1 } } });
          await tx.economyInventory.upsert({
            where: { guildId_userId_itemId: { guildId: offer.guildId, userId: offer.recipientId, itemId: offer.itemId } },
            create: { guildId: offer.guildId, userId: offer.recipientId, itemId: offer.itemId, itemName: offer.itemName ?? 'Item', quantity: 1 },
            update: { quantity: { increment: 1 } },
          });
        }
        if (offer.coins > 0) {
          await tx.economyBalance.update({ where: { guildId_userId: { guildId: offer.guildId, userId: offer.senderId } }, data: { wallet: { decrement: offer.coins } } });
          await tx.economyBalance.upsert({
            where: { guildId_userId: { guildId: offer.guildId, userId: offer.recipientId } },
            create: { guildId: offer.guildId, userId: offer.recipientId, wallet: offer.coins },
            update: { wallet: { increment: offer.coins } },
          });
        }
      });
    } catch {
      offers.delete(tradeId);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(COLORS.ERROR).setTitle(t('trade.failedTitle', loc)).setDescription(t('trade.failed', loc))], components: [] }).catch(() => {});
      return;
    }
    offers.delete(tradeId);
    const parts: string[] = [];
    if (offer.coins > 0) parts.push(EconomyModule.format(offer.coins, cfg));
    if (offer.itemName) parts.push(`**${offer.itemName}**`);
    await interaction.update({ embeds: [new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('trade.doneTitle', loc)).setDescription(t('trade.done', loc, { sender: `<@${offer.senderId}>`, recipient: `<@${offer.recipientId}>`, offer: parts.join(' + ') }))], components: [] }).catch(() => {});
  },
};

export default command;
