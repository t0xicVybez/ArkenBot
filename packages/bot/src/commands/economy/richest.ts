/** /richest — the guild's wealth leaderboard by net worth (wallet + bank). */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder().setName('richest').setDescription('View the server\'s wealth leaderboard'),
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
    const rows = await prisma.economyBalance.findMany({ where: { guildId: interaction.guild.id } });
    const ranked = rows
      .map((r) => ({ userId: r.userId, net: r.wallet + r.bank }))
      .filter((r) => r.net > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 10);
    if (ranked.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.leaderboardTitle', loc), t('economy.leaderboardEmpty', loc))] });
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const lines = ranked.map((r, i) => `${medals[i] ?? `\`#${i + 1}\``} <@${r.userId}> — **${EconomyModule.format(r.net, cfg)}**`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(t('economy.leaderboardTitle', loc))
      .setDescription(lines.join('\n'))
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
