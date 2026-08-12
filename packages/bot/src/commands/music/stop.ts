/**
 * /stop command — stops playback, clears the queue, and disconnects the bot
 * from the voice channel.
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
    .setName('stop')
    .setDescription('Stop music and clear the queue'),
  category: 'music',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.stop.disabledTitle', loc), t('cmd.stop.disabled', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);
    if (!queue) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.stop.nothingTitle', loc), t('cmd.stop.nothing', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    queue.destroy();
    MusicManager.deleteQueue(interaction.guild.id);

    await interaction.reply({ embeds: [successEmbed(t('cmd.stop.title', loc), t('cmd.stop.stopped', loc))] });
  },
};

export default command;
