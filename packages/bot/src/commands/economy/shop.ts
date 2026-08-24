/** /shop view|buy — browse the guild shop and purchase items (roles / collectibles). */
import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and buy from the server shop')
    .addSubcommand((s) => s.setName('view').setDescription('List the items for sale'))
    .addSubcommand((s) => s.setName('buy').setDescription('Purchase an item')
      .addStringOption((o) => o.setName('item').setDescription('Which item to buy').setRequired(true).setAutocomplete(true))),
  category: 'Economy',

  async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
    if (!interaction.guildId) return interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const items = await prisma.economyShopItem.findMany({ where: { guildId: interaction.guildId, enabled: true }, take: 25, orderBy: { price: 'asc' } });
    await interaction.respond(
      items.filter((i) => i.name.toLowerCase().includes(focused)).slice(0, 25).map((i) => ({ name: `${i.name} — ${i.price}`, value: i.id })),
    );
  },

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
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const items = await prisma.economyShopItem.findMany({ where: { guildId, enabled: true }, orderBy: { price: 'asc' } });
      if (items.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed(t('economy.shopTitle', loc), t('economy.shopEmpty', loc))] });
        return;
      }
      const lines = items.map((i) => {
        const stock = i.stock < 0 ? '' : ` · ${t('economy.stockLeft', loc, { n: String(i.stock) })}`;
        const role = i.roleId ? ` · <@&${i.roleId}>` : '';
        return `**${i.name}** — ${EconomyModule.format(i.price, cfg)}${stock}${role}\n${i.description ? `> ${i.description}` : ''}`;
      });
      const embed = new EmbedBuilder().setColor(COLORS.INFO).setTitle(t('economy.shopTitle', loc))
        .setDescription(lines.join('\n\n')).setFooter({ text: t('economy.shopFooter', loc) }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // buy
    const itemId = interaction.options.getString('item', true);
    const item = await prisma.economyShopItem.findFirst({ where: { id: itemId, guildId, enabled: true } });
    if (!item) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.shopItemGone', loc))] });
      return;
    }
    if (item.stock === 0) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.outOfStock', loc))] });
      return;
    }
    const bal = await EconomyModule.getBalance(guildId, interaction.user.id, cfg.startingBalance);
    if (bal.wallet < item.price) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.cantAfford', loc, { item: item.name, price: EconomyModule.format(item.price, cfg) }))] });
      return;
    }
    // Grant the role first (if any) so we don't debit on a permission failure.
    if (item.roleId) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const role = interaction.guild.roles.cache.get(item.roleId);
      const me = interaction.guild.members.me;
      if (!member || !role) {
        await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.roleGone', loc))] });
        return;
      }
      if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles) || role.position >= (me?.roles.highest.position ?? 0)) {
        await notifyActionFailure(interaction.guild, { action: 'manageRoles', error: new Error('Missing ManageRoles or role hierarchy too low'), channelId: interaction.channelId, target: role.id }).catch(() => {});
        await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.roleNoPerms', loc))] });
        return;
      }
      const granted = await member.roles.add(role, 'Economy shop purchase').then(() => true).catch(async (err) => {
        await notifyActionFailure(interaction.guild!, { action: 'manageRoles', error: err, channelId: interaction.channelId, target: role.id }).catch(() => {});
        return false;
      });
      if (!granted) {
        await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.roleNoPerms', loc))] });
        return;
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data: { wallet: { decrement: item.price } } });
      if (item.stock > 0) await tx.economyShopItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
      await tx.economyInventory.upsert({
        where: { guildId_userId_itemId: { guildId, userId: interaction.user.id, itemId: item.id } },
        create: { guildId, userId: interaction.user.id, itemId: item.id, itemName: item.name, quantity: 1 },
        update: { quantity: { increment: 1 } },
      });
    });
    const embed = new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('economy.buyTitle', loc))
      .setDescription(t('economy.buyDesc', loc, { item: item.name, price: EconomyModule.format(item.price, cfg) })).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
