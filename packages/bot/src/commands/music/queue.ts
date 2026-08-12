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
import { t, resolveUserLocale } from '../../i18n/index.js';
import { MusicManager } from '../../modules/music/MusicManager.js';
import { getGuildSettings } from '../../utils/settings.js';
import { COLORS } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the music queue'),
  category: 'music',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.queue.disabledTitle', loc), t('cmd.queue.disabled', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const queue = MusicManager.getQueue(interaction.guild.id);

    if (!queue || !queue.currentTrack) {
      await interaction.reply({ embeds: [errorEmbed(t('cmd.queue.nothingTitle', loc), t('cmd.queue.nothing', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const tracks = queue.tracks.slice(0, 10);
    const body = tracks.length > 0
      ? tracks.map((tr, i) => `${i + 1}. **${tr.title}** — <@${tr.requestedBy.id}>`).join('\n')
      : t('cmd.queue.empty', loc);
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.queue.title', loc))
      .setDescription(`${t('cmd.queue.nowPlaying', loc, { title: queue.currentTrack.title })}\n\n${body}`)
      .setFooter({
        text: t('cmd.queue.footer', loc, { count: queue.tracks.length, loop: queue.loop }),
      });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
