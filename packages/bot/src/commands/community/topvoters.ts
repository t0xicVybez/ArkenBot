/**
 * /topvoters — the bot's most dedicated top.gg voters, ranked by total votes.
 */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';

import { swallow } from '../../logger.js';
const MEDALS = ['🥇', '🥈', '🥉'];

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('topvoters')
    .setDescription('See the top.gg voters who support the bot the most'),
  category: 'community',

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply();

    const voters = await prisma.topggVoter.findMany({
      orderBy: { totalVotes: 'desc' },
      take: 10,
      where: { totalVotes: { gt: 0 } },
    });

    if (voters.length === 0) {
      await interaction.editReply('No votes recorded yet — be the first with `/vote`! 🗳️');
      return;
    }

    const lines = await Promise.all(
      voters.map(async (v, i) => {
        const rank = MEDALS[i] ?? `**${i + 1}.**`;
        const user = await client.users.fetch(v.userId).catch(swallow);
        const name = user ? user.username : `User ${v.userId}`;
        const streak = v.currentStreak > 1 ? ` · ${v.currentStreak}🔥` : '';
        return `${rank} ${name} — **${v.totalVotes}** vote${v.totalVotes === 1 ? '' : 's'}${streak}`;
      }),
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('🏆 Top Voters')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Vote with /vote · top.gg/bot/${client.user!.id}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
