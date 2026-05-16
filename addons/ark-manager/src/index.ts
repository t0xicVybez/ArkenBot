/** ARK Manager addon entry point — registers the `/ark` command with the bot runtime. */
import { defineAddon } from '@arkenbot/addon-sdk';
import arkCommand from './commands/ark.js';

export default defineAddon({
  manifest: {
    name: 'ark-manager',
    displayName: 'ARK Manager',
    version: '1.0.0',
    description: 'Manage your ARK: Survival Evolved server from Discord via RCON.',
    author: 'ArkenBot',
    commands: ['ark'],
  },
  commands: [arkCommand],
  hooks: {
    onLoad: async (ctx) => {
      ctx.logger.info('ARK Manager v1.0 loaded.');
    },
  },
});
