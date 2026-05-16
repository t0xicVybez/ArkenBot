import { defineAddon } from '@arkenbot/addon-sdk';
import minecraftCommand from './commands/minecraft.js';

export default defineAddon({
  manifest: {
    name: 'minecraft-manager',
    displayName: 'Minecraft Manager',
    version: '1.0.0',
    description: 'Manage your Minecraft server from Discord via RCON.',
    author: 'ArkenBot',
    commands: ['minecraft'],
  },
  commands: [minecraftCommand],
  hooks: {
    onLoad: async (ctx) => {
      ctx.logger.info('Minecraft Manager v1.0 loaded.');
    },
  },
});
