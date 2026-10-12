
import type { Message, PartialMessage } from 'discord.js';
import type { BotEvent } from '../types.js';
import { LoggingModule } from '../modules/logging/LoggingModule.js';

import { swallow } from '../logger.js';

// Logs message edits to the server's log channel. We re-fetch the edited
// message so we're logging its real current content, not a partial.
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
