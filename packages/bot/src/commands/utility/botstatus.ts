/**
 * /botstatus command — reports runtime metrics: guild count, WebSocket latency,
 * uptime, and heap memory usage.
 */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { infoEmbed } from '../../utils/embed.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('botstatus')
    .setDescription('Show a quick summary of the bot\'s current status'),
  category: 'utility',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);
    const uptimeStr = `${hours}h ${mins}m ${secs}s`;

    const mem = process.memoryUsage();
    const memMB = Math.round(mem.heapUsed / 1024 / 1024);

    await interaction.reply({
      embeds: [
        infoEmbed('Bot Status')
          .addFields(
            { name: 'Servers', value: String(client.guilds.cache.size), inline: true },
            { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
            { name: 'Uptime', value: uptimeStr, inline: true },
            { name: 'Memory', value: `${memMB} MB`, inline: true },
          ),
      ],
    });
  },
};

export default command;
