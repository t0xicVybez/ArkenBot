/**
 * /invitetop command — renders the top-10 invite leaderboard for the guild.
 * Requires the invite tracker to be enabled in guild settings.
 */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { InviteTrackerModule } from '../../modules/inviteTracker/InviteTrackerModule.js';
import { errorEmbed } from '../../utils/embed.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('invitetop')
    .setDescription('Show the top inviters leaderboard for this server'),
  category: 'community',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'Use this command in a server.')] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    if (!extended.inviteTrackerEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Disabled', 'Invite tracking is not enabled for this server.')] });
      return;
    }

    const rows = await InviteTrackerModule.getLeaderboard(interaction.guild.id, 10);

    if (rows.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed('No Data', 'No invite data recorded yet.')] });
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((r: { userId: string; invites: number; bonus: number }, i: number) => {
      const total = r.invites + r.bonus;
      const prefix = medals[i] ?? `**${i + 1}.**`;
      return `${prefix} <@${r.userId}> — **${total}** invite${total !== 1 ? 's' : ''}`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(`🏆 Top Inviters — ${interaction.guild.name}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${rows.length} inviters` });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
