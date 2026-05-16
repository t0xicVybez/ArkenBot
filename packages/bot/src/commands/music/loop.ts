/**
 * /loop command — sets the queue loop mode to off, single-track, or full-queue repeat.
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
    .setName('loop')
    .setDescription('Set the loop mode for the queue')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Loop mode')
        .addChoices(
          { name: 'Off', value: 'none' },
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' },
        )
        .setRequired(true)
    ),
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
    if (!queue) {
      await interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'No music is currently playing.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const mode = interaction.options.getString('mode', true) as 'none' | 'track' | 'queue';
    queue.loop = mode;

    const labels: Record<string, string> = { none: 'Off', track: 'Track', queue: 'Queue' };
    await interaction.reply({ embeds: [successEmbed('Loop', `Loop mode set to **${labels[mode]}**`)] });
  },
};

export default command;
