import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { AutocompleteInteraction, Interaction } from 'discord.js';
import faqCommand from './commands/faq.js';
import faqAdminCommand from './commands/faq-admin.js';
import { interactionHandler } from './events/interaction.js';
import { locales } from './locales.js';

export default defineAddon({
  locales,
  manifest: {
    name: 'faq',
    displayName: 'FAQ / Knowledge Base',
    version: '1.0.0',
    description: 'A searchable knowledge base. Admins store Q&A entries; members find answers instantly with /faq and autocomplete. No AI or external API required.',
    author: 'ArkenBot',
    commands: ['faq', 'faq-admin'],
    settings: [],
  },
  commands: [faqCommand, faqAdminCommand],
  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;
        if (interaction.isAutocomplete()) {
          const ac = interaction as AutocompleteInteraction;
          if (ac.commandName === 'faq' && faqCommand.autocomplete) await faqCommand.autocomplete(ac, ctx);
          else if (ac.commandName === 'faq-admin' && faqAdminCommand.autocomplete) await faqAdminCommand.autocomplete(ac, ctx);
          return;
        }
        await interactionHandler.handle(ctx, interaction);
      },
    },
  ],
  hooks: { onLoad(ctx: AddonContext): void { ctx.logger.info('FAQ / Knowledge Base loaded.'); } },
});
