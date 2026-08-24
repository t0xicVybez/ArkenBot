/**
 * /economy — admin controls for the guild economy (ManageGuild).
 * Subcommands: give, take, reset, additem, removeitem. Full configuration
 * (currency, reward amounts, rob/gambling tuning) lives on the dashboard.
 */
import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags,
  type ChatInputCommandInteraction, type AutocompleteInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Admin controls for the server economy')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((s) => s.setName('give').setDescription('Add currency to a member\'s wallet')
      .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('take').setDescription('Remove currency from a member\'s wallet')
      .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to remove').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('reset').setDescription('Reset a member\'s balance to zero')
      .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(true)))
    .addSubcommand((s) => s.setName('additem').setDescription('Add an item to the shop')
      .addStringOption((o) => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption((o) => o.setName('price').setDescription('Price').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('description').setDescription('Short description').setRequired(false))
      .addRoleOption((o) => o.setName('role').setDescription('Role granted on purchase').setRequired(false))
      .addIntegerOption((o) => o.setName('stock').setDescription('Limited stock (omit for unlimited)').setRequired(false).setMinValue(1)))
    .addSubcommand((s) => s.setName('removeitem').setDescription('Remove a shop item')
      .addStringOption((o) => o.setName('item').setDescription('Item to remove').setRequired(true).setAutocomplete(true))),
  category: 'Economy',
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
    if (!interaction.guildId) return interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const items = await prisma.economyShopItem.findMany({ where: { guildId: interaction.guildId }, take: 25, orderBy: { createdAt: 'desc' } });
    await interaction.respond(items.filter((i) => i.name.toLowerCase().includes(focused)).slice(0, 25).map((i) => ({ name: i.name, value: i.id })));
  },

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.needManage', loc))], flags: MessageFlags.Ephemeral });
      return;
    }
    const cfg = await EconomyModule.getConfigOrDefault(interaction.guild.id);
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'additem') {
      const name = interaction.options.getString('name', true);
      const price = interaction.options.getInteger('price', true);
      const description = interaction.options.getString('description') ?? null;
      const role = interaction.options.getRole('role');
      const stock = interaction.options.getInteger('stock') ?? -1;
      await prisma.economyShopItem.create({ data: { guildId, name, price, description, roleId: role?.id ?? null, stock } });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('economy.itemAddedTitle', loc)).setDescription(t('economy.itemAdded', loc, { item: name, price: EconomyModule.format(price, cfg) }))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'removeitem') {
      const id = interaction.options.getString('item', true);
      const res = await prisma.economyShopItem.deleteMany({ where: { id, guildId } });
      const ok = res.count > 0;
      await interaction.reply({ embeds: [ok ? new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('economy.itemRemovedTitle', loc)).setDescription(t('economy.itemRemoved', loc)) : errorEmbed(t('economy.errorTitle', loc), t('economy.shopItemGone', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const target = interaction.options.getUser('user', true);
    if (target.bot) {
      await interaction.reply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.noBots', loc))], flags: MessageFlags.Ephemeral });
      return;
    }
    await EconomyModule.getBalance(guildId, target.id, cfg.startingBalance);

    if (sub === 'give') {
      const amount = interaction.options.getInteger('amount', true);
      const updated = await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: target.id } }, data: { wallet: { increment: amount } } });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('economy.giveTitle', loc)).setDescription(t('economy.giveDesc', loc, { amount: EconomyModule.format(amount, cfg), user: `<@${target.id}>`, wallet: EconomyModule.format(updated.wallet, cfg) }))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'take') {
      const amount = interaction.options.getInteger('amount', true);
      const bal = await EconomyModule.getBalance(guildId, target.id, cfg.startingBalance);
      const dec = Math.min(amount, bal.wallet);
      const updated = await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: target.id } }, data: { wallet: { decrement: dec } } });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.WARNING).setTitle(t('economy.takeTitle', loc)).setDescription(t('economy.takeDesc', loc, { amount: EconomyModule.format(dec, cfg), user: `<@${target.id}>`, wallet: EconomyModule.format(updated.wallet, cfg) }))], flags: MessageFlags.Ephemeral });
      return;
    }
    // reset
    await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: target.id } }, data: { wallet: 0, bank: 0, dailyStreak: 0 } });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.WARNING).setTitle(t('economy.resetTitle', loc)).setDescription(t('economy.resetDesc', loc, { user: `<@${target.id}>` }))], flags: MessageFlags.Ephemeral });
  },
};

export default command;
