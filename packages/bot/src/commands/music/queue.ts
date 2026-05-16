/**
 * /queue command — displays the currently playing track and the next 10 queued tracks.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { errorEmbed } from '../../utils/embed.js';
import { MusicManager } from '../../modules/music/MusicManager.js';
import { getGuildSettings } from '../../utils/settings.js';
import { COLORS } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the music queue'),
  category: 'music',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed('Music Disabled', 'Music commands are disabled for this server.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);

    if (!queue || !queue.currentTrack) {
      await interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'No music is currently playing.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const tracks = queue.tracks.slice(0, 10);
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('🎵 Music Queue')
      .setDescription(
        `**Now Playing:** ${queue.currentTrack.title}\n\n` +
        (tracks.length > 0
          ? tracks.map((t, i) => `${i + 1}. **${t.title}** — <@${t.requestedBy.id}>`).join('\n')
          : '_Queue is empty_')
      )
      .setFooter({
        text: `${queue.tracks.length} song(s) in queue • Loop: ${queue.loop}`,
      });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
