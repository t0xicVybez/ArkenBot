/**
 * /play command — resolves a search query or URL and either starts playback
 * immediately or adds the track to the existing queue.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type VoiceBasedChannel,
  type TextChannel,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { MusicManager } from '../../modules/music/MusicManager.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Song name or YouTube/Spotify URL').setRequired(true)
    ),
  category: 'music',
  botPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.musicEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.play.disabledTitle', loc), t('cmd.play.disabled', loc))] });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel as VoiceBasedChannel | null;

    if (!voiceChannel) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.play.joinVcTitle', loc), t('cmd.play.joinVc', loc))],
      });
      return;
    }

    const botMember = await interaction.guild.members.fetchMe();
    if (botMember.voice.channel && botMember.voice.channel.id !== voiceChannel.id) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.play.wrongChannelTitle', loc), t('cmd.play.wrongChannel', loc, { channel: `<#${botMember.voice.channel.id}>` }))],
      });
      return;
    }

    const query = interaction.options.getString('query', true);

    try {
      const textChannel = interaction.channel?.isTextBased() ? interaction.channel as TextChannel : undefined;
      const result = await MusicManager.play(interaction.guild, voiceChannel, query, interaction.user, textChannel);

      if (result.type === 'added') {
        await interaction.editReply({
          embeds: [
            successEmbed(t('cmd.play.addedTitle', loc), t('cmd.play.added', loc, { title: result.title, position: `${result.position ?? ''}` })),
          ],
        });
      } else if (result.type === 'playing') {
        await interaction.editReply({
          embeds: [
            infoEmbed(t('cmd.play.nowPlayingTitle', loc), t('cmd.play.nowPlaying', loc, { title: result.title }))
              .addFields(
                { name: t('cmd.play.requestedBy', loc), value: `<@${interaction.user.id}>`, inline: true },
                { name: t('cmd.play.duration', loc), value: result.duration ?? t('cmd.play.unknown', loc), inline: true },
              )
              .setThumbnail(result.thumbnail ?? null),
          ],
        });
      }
    } catch (err) {
      await interaction.editReply({
        embeds: [errorEmbed(t('common.error', loc), t('cmd.play.failed', loc, { error: (err as Error).message }))],
      });
    }
  },
};

export default command;
