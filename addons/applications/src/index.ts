import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { AutocompleteInteraction, Interaction } from 'discord.js';
import applyCommand from './commands/apply.js';
import appSetupCommand from './commands/app-setup.js';
import { interactionHandler } from './events/interaction.js';

export default defineAddon({
  manifest: {
    name: 'applications',
    displayName: 'Application System',
    version: '1.0.0',
    description: 'Configurable application forms with modal collection, staff review channel, and accept/deny workflow.',
    author: 't0xicVybez',
    commands: ['apply', 'app-setup'],
    settings: [],
  },

  commands: [applyCommand, appSetupCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;

        // Route autocomplete to the correct command handler
        if (interaction.isAutocomplete()) {
          if (interaction.commandName === 'apply' && applyCommand.autocomplete) {
            await applyCommand.autocomplete(interaction as AutocompleteInteraction, ctx);
          } else if (interaction.commandName === 'app-setup' && appSetupCommand.autocomplete) {
            await appSetupCommand.autocomplete(interaction as AutocompleteInteraction, ctx);
          }
          return;
        }

        await interactionHandler.handle(ctx, interaction);
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info('Application System loaded.');
    },
  },
});
