import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Interaction } from 'discord.js';
import confessCommand from './commands/confess.js';
import confessSetupCommand from './commands/confess-setup.js';
import { interactionHandler } from './events/interaction.js';
import { locales } from './locales.js';

export default defineAddon({
  locales,
  manifest: {
    name: 'confessions',
    displayName: 'Anonymous Confessions',
    version: '1.0.0',
    description: 'An anonymous confessions board: members submit privately via /confess, with optional staff approval, reply threads, per-user cooldowns, blocklist, and staff-only author lookup for abuse handling.',
    author: 'ArkenBot',
    commands: ['confess', 'confess-setup'],
    settings: [],
  },

  commands: [confessCommand, confessSetupCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        await interactionHandler.handle(ctx, args[0] as Interaction);
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info('Anonymous Confessions loaded.');
    },
  },
});
