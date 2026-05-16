/**
 * /ping command — measures roundtrip latency and WebSocket heartbeat latency,
 * then reports both values.
 */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { infoEmbed } from '../../utils/embed.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency'),
  category: 'utility',
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const { resource } = await interaction.reply({ content: 'Pinging...', withResponse: true });
    const roundtrip = resource!.message!.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      content: '',
      embeds: [
        infoEmbed('🏓 Pong!')
          .addFields(
            { name: 'Roundtrip', value: `${roundtrip}ms`, inline: true },
            { name: 'WebSocket', value: `${client.ws.ping}ms`, inline: true },
          ),
      ],
    });
  },
};

export default command;
