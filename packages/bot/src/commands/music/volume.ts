/**
 * /volume command — adjusts the playback volume for the active queue (1–100).
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
    .setName('volume')
    .setDescription('Set the music volume')
    .addIntegerOption((opt) =>
      opt.setName('level').setDescription('Volume level (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)
    ),
  category: 'music',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.volume.disabledTitle', loc), t('cmd.volume.disabled', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.volume.nothingTitle', loc), t('cmd.volume.nothing', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const level = interaction.options.getInteger('level', true);
    queue.setVolume(level);

    await interaction.reply({ embeds: [successEmbed(t('cmd.volume.title', loc), t('cmd.volume.set', loc, { level }))] });
  },
};

export default command;
