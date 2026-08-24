/** /inventory — list the items a member owns from shop purchases. */
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
    .setName('inventory')
    .setDescription('View owned items')
    .addUserOption((o) => o.setName('user').setDescription('Whose inventory to view').setRequired(false)),
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
    const target = interaction.options.getUser('user') ?? interaction.user;
    const items = await prisma.economyInventory.findMany({ where: { guildId: interaction.guild.id, userId: target.id }, orderBy: { createdAt: 'asc' } });
    if (items.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.inventoryTitle', loc, { user: target.username }), t('economy.inventoryEmpty', loc))] });
      return;
    }
    const lines = items.map((i) => `• **${i.itemName}**${i.quantity > 1 ? ` ×${i.quantity}` : ''}`);
    const embed = new EmbedBuilder().setColor(COLORS.INFO)
      .setAuthor({ name: t('economy.inventoryTitle', loc, { user: target.username }), iconURL: target.displayAvatarURL() })
      .setDescription(lines.join('\n')).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
