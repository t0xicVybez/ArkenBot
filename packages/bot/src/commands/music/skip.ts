/**
 * /skip command — skips the currently playing track and advances the queue.
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
    .setName('skip')
    .setDescription('Skip the current song'),
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
      await interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'There is nothing to skip.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const skipped = queue.currentTrack.title;
    queue.skip();

    await interaction.reply({
      embeds: [successEmbed('Skipped', `Skipped **${skipped}**`)],
    });
  },
};

export default command;
