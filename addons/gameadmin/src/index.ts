/**
 * Game Server Admin addon — RCON control for Minecraft, Palworld, ARK, Rust,
 * Valheim, and 7 Days to Die. All commands are gated behind Manage Server.
 * RCON passwords are sealed with AES-256-GCM before they touch storage.
 */
import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Interaction } from 'discord.js';
import gameadminCommand from './commands/gameadmin.js';
import { interactionHandler } from './events/interaction.js';
import { locales } from './locales.js';

export default defineAddon({
  locales,
  manifest: {
    name: 'gameadmin',
    displayName: 'Game Server Admin',
    version: '1.0.0',
    description:
      'Control your game servers over RCON — run console commands, list/kick/ban players, broadcast, save, and stop. Supports Minecraft, Palworld, ARK, Rust, Valheim, and 7 Days to Die. RCON passwords are encrypted at rest, and every command requires the Manage Server permission.',
    author: 't0xicVybez',
    commands: ['gameadmin'],
    settings: [],
  },

  commands: [gameadminCommand],

  events: [
    {
      // Autocomplete is auto-routed by the host to the command; here we only
      // need to finish `/gameadmin add` when its password modal comes back.
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;
        if (interaction.isModalSubmit()) {
          await interactionHandler.handle(ctx, interaction);
        }
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info('Game Server Admin loaded.');
    },
  },
});
