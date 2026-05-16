/**
 * messageUpdate event — logs message edits. Always fetches the latest version of
 * the updated message because the cached copy may be stale by the time the event fires.
 */
import type { Message, PartialMessage } from 'discord.js';
import type { BotEvent } from '../types.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';

const event: BotEvent = {
  name: 'messageUpdate',
  async execute(_client: unknown, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    if (!newMessage.guild) return;

    const fresh = newMessage.partial
      ? await newMessage.fetch().catch(() => null)
      : await newMessage.fetch().catch(() => newMessage as Message);
    if (!fresh) return;

    // oldMessage may be partial when it was not in cache before the edit.
    // The logging module handles the missing content gracefully.
    await LoggingModule.logMessageEdit(newMessage.guild, oldMessage as Message, fresh);
  },
};

export default event;
