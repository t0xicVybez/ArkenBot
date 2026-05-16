/**
 * /pause command — pauses the currently playing track in the guild's music queue.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed, errorEmbed } from '../../utils/embed.js';
import { MusicManager } from '../../modules/music/MusicManager.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
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

    const paused = queue.pause();
    if (!paused) {
      await interaction.reply({ embeds: [errorEmbed('Already Paused', 'The music is already paused.')], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ embeds: [successEmbed('Paused', `Paused **${queue.currentTrack.title}**`)] });
  },
};

export default command;
