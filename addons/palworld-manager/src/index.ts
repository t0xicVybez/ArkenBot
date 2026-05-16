import { defineAddon } from '@arkenbot/addon-sdk';
import palworldCommand from './commands/palworld.js';

export default defineAddon({
  manifest: {
    name: 'palworld-manager',
    displayName: 'Palworld Manager',
    version: '1.0.0',
    description: 'Manage your Palworld dedicated server from Discord via REST API.',
    author: 'ArkenBot',
    commands: ['palworld'],
  },
  commands: [palworldCommand],
  hooks: {
    onLoad: async (ctx) => {
      ctx.logger.info('Palworld Manager v1.0 loaded.');
    },
  },
});
