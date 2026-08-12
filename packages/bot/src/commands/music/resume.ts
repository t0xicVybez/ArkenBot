/**
 * /resume command — resumes a paused track in the guild's music queue.
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
    .setName('resume')
    .setDescription('Resume the paused song'),
  category: 'music',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.resume.disabledTitle', loc), t('cmd.resume.disabled', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.resume.nothingTitle', loc), t('cmd.resume.nothing', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const resumed = queue.resume();
    if (!resumed) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.resume.notPausedTitle', loc), t('cmd.resume.notPaused', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ embeds: [successEmbed(t('cmd.resume.title', loc), t('cmd.resume.resumed', loc, { title: queue.currentTrack.title }))] });
  },
};

export default command;
