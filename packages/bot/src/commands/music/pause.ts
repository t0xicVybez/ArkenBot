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
import { t, resolveUserLocale } from '../../i18n/index.js';
import { MusicManager } from '../../modules/music/MusicManager.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
  category: 'music',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.pause.disabledTitle', loc), t('cmd.pause.disabled', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.pause.nothingTitle', loc), t('cmd.pause.nothing', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const paused = queue.pause();
    if (!paused) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.pause.alreadyPausedTitle', loc), t('cmd.pause.alreadyPaused', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ embeds: [successEmbed(t('cmd.pause.title', loc), t('cmd.pause.paused', loc, { title: queue.currentTrack.title }))] });
  },
};

export default command;
