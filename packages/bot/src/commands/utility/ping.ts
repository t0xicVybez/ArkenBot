/**
 * /ping command — measures roundtrip latency and WebSocket heartbeat latency,
 * then reports both values.
 */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { infoEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency'),
  category: 'utility',
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const { resource } = await interaction.reply({ content: t('cmd.ping.pinging', loc), withResponse: true });
    const roundtrip = resource!.message!.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      content: '',
      embeds: [
        infoEmbed(t('cmd.ping.pong', loc))
          .addFields(
            { name: t('cmd.ping.roundtrip', loc), value: `${roundtrip}ms`, inline: true },
            { name: t('cmd.ping.websocket', loc), value: `${client.ws.ping}ms`, inline: true },
          ),
      ],
    });
  },
};

export default command;
