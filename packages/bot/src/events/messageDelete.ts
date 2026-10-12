
import type { Message, PartialMessage } from 'discord.js';
import type { BotEvent } from '../types.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';

// Logs deleted messages to the server's configured log channel. Partial
// (uncached) messages have no content to log, so they're skipped.
const event: BotEvent = {
  name: 'messageDelete',
  async execute(_client: unknown, message: Message | PartialMessage) {
    if (!message.guild || message.partial) return;
    await LoggingModule.logMessageDelete(message.guild, message as Message);
  },
};

export default event;
