/** FiveM Manager addon entry point — registers the `/fivem` command with the bot runtime. */
import { defineAddon } from '@arkenbot/addon-sdk';
import fivemCommand from './commands/fivem.js';

export default defineAddon({
  manifest: {
    name: 'fivem-manager',
    displayName: 'FiveM Manager',
    version: '1.0.0',
    description: 'Manage your FiveM server from Discord. Supports QBCore and ESX.',
    author: 'ArkenBot',
    commands: ['fivem'],
  },
  commands: [fivemCommand],
  hooks: {
    onLoad: async (ctx) => {
      ctx.logger.info('FiveM Manager v1.0 loaded.');
    },
  },
});
