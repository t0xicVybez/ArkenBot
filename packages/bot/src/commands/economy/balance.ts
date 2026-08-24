/** /balance — show a member's wallet, bank and net worth plus their richest rank. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your or another member\'s balance')
    .addUserOption((o) => o.setName('user').setDescription('Whose balance to check').setRequired(false)),
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
    if (target.bot) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.noBots', loc))] });
      return;
    }
    const bal = await EconomyModule.getBalance(interaction.guild.id, target.id, cfg.startingBalance);
    const rank = await EconomyModule.rank(interaction.guild.id, target.id);
    const fmt = (n: number) => EconomyModule.format(n, cfg);
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setAuthor({ name: t('economy.balanceTitle', loc, { user: target.username }), iconURL: target.displayAvatarURL() })
      .addFields(
        { name: t('economy.wallet', loc), value: fmt(bal.wallet), inline: true },
        { name: t('economy.bank', loc), value: fmt(bal.bank), inline: true },
        { name: t('economy.net', loc), value: fmt(EconomyModule.net(bal)), inline: true },
      )
      .setFooter({ text: t('economy.rankFooter', loc, { rank: String(rank), currency: cfg.currencyName }) })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
