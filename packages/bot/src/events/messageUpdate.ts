
import type { Message, PartialMessage } from 'discord.js';
import type { BotEvent } from '../types.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';

import { swallow } from '../logger.js';
const event: BotEvent = {
  name: 'messageUpdate',
  async execute(_client: unknown, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    if (!newMessage.guild) return;

    const fresh = newMessage.partial
      ? await newMessage.fetch().catch(swallow)
      : await newMessage.fetch().catch(() => newMessage as Message);
    if (!fresh) return;

    await LoggingModule.logMessageEdit(newMessage.guild, oldMessage as Message, fresh);
  },
};

export default event;
