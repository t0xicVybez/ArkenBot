import { defineAddon, type AddonContext } from '@arkenbot/addon-sdk';
import type { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import translateCommand from './commands/translate.js';
import translateCtxCommand from './commands/translateCtx.js';
import { onFlagReaction } from './events/flagReact.js';
import { locales } from './locales.js';

export default defineAddon({
  locales,
  manifest: {
    name: 'translate',
    displayName: 'Translator',
    version: '1.0.0',
    description:
      'Translate messages with self-hosted LibreTranslate: /translate, a right-click "Translate" action, and react to any message with a country-flag emoji to translate it to that language.',
    author: 't0xicVybez',
    commands: ['translate', 'Translate'],
    settings: [],
  },

  commands: [translateCommand, translateCtxCommand],

  events: [
    {
      event: 'messageReactionAdd',
      handler: (ctx: AddonContext, ...args: unknown[]): Promise<void> =>
        onFlagReaction(ctx, args[0] as MessageReaction | PartialMessageReaction, args[1] as User | PartialUser),
    },
  ],
});
