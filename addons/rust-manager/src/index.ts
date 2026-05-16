import { defineAddon } from '@arkenbot/addon-sdk';
import rustCommand from './commands/rust.js';

export default defineAddon({
  manifest: {
    name: 'rust-manager',
    displayName: 'Rust Manager',
    version: '1.0.0',
    description: 'Manage your Rust server from Discord via WebSocket RCON.',
    author: 'ArkenBot',
    commands: ['rust'],
  },
  commands: [rustCommand],
  hooks: {
    onLoad: async (ctx) => {
      ctx.logger.info('Rust Manager v1.0 loaded.');
    },
  },
});
