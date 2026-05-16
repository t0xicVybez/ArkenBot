/**
 * guildCreate event — runs when the bot joins a new guild. Ensures the guild
 * record exists in the database, immediately deploys application commands to the
 * guild, and publishes a join event to the Redis pub/sub channel.
 */
import {
  REST,
  Routes,
  type Guild,
} from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { ensureGuildExists } from '../utils/settings.js';
import { logger } from '../logger.js';
import { pub } from '../redis.js';
import { config } from '../config.js';


const event: BotEvent = {
  name: 'guildCreate',
  async execute(_client: unknown, guild: Guild) {
    logger.info(`Joined guild: ${guild.name} (${guild.id})`);

    await ensureGuildExists(
      guild.id,
      guild.name,
      guild.ownerId,
      guild.iconURL() ?? undefined
    );

    // Commands are registered per-guild immediately rather than waiting for the next
    // global deploy cycle, so members can use slash commands straight away.
    try {
      const client = _client as BotClient;
      const commands = [...client.commands.values()].map((cmd) => cmd.data.toJSON());
      const rest = new REST({ version: '10' }).setToken(config.discord.token);
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, guild.id),
        { body: commands },
      );
      logger.info(`Deployed ${commands.length} commands to new guild ${guild.name} (${guild.id})`);
    } catch (err) {
      logger.error({ err }, `Failed to deploy commands to guild ${guild.id}`);
    }

    await pub.publish('bot:events', JSON.stringify({
      type: 'guild:joined',
      data: { guildId: guild.id, name: guild.name, memberCount: guild.memberCount },
    }));
  },
};

export default event;
