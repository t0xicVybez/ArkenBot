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
import { t, resolveUserLocale } from '../../i18n/index.js';
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
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.loop.disabledTitle', loc), t('cmd.loop.disabled', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.loop.nothingTitle', loc), t('cmd.loop.nothing', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const mode = interaction.options.getString('mode', true) as 'none' | 'track' | 'queue';
    queue.loop = mode;

    const labels: Record<string, string> = { none: t('cmd.loop.modeOff', loc), track: t('cmd.loop.modeTrack', loc), queue: t('cmd.loop.modeQueue', loc) };
    await interaction.reply({ embeds: [successEmbed(t('cmd.loop.title', loc), t('cmd.loop.set', loc, { mode: labels[mode] }))] });
  },
};

export default command;
