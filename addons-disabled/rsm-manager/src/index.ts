import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { AutocompleteInteraction, Client, Interaction } from 'discord.js';
import serverCommand, { initClient, restoreMonitors } from './commands/server.js';

export default defineAddon({
  manifest: {
    name: 'rsm-manager',
    displayName: 'RSM Server Manager',
    version: '1.1.0',
    description: 'Control game servers managed by Ronin Server Manager directly from Discord.',
    author: 't0xicVybez',
    commands: ['rsm'],
    settings: [],
  },

  commands: [serverCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;
        if (interaction.isAutocomplete() && interaction.commandName === 'rsm') {
          await serverCommand.autocomplete!(interaction as AutocompleteInteraction, ctx);
        }
      },
    },
    {
      event: 'ready',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const client = args[0] as Client;
        initClient(client);
        await restoreMonitors(ctx);
      },
    },
  ],
});
