
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { InteractionHandler } from '../handlers/InteractionHandler.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';

// The handler is created once, lazily, and reused for every interaction.
let handler: InteractionHandler | null = null;

/**
 * Fires on every interaction (slash command, button, select, modal,
 * autocomplete). Routes it through the InteractionHandler, and separately
 * records command usage for the analytics dashboard.
 */
const event: BotEvent = {
  name: 'interactionCreate',
  async execute(client: BotClient, interaction: import('discord.js').Interaction) {
    if (!handler) handler = new InteractionHandler(client);
    await handler.handle(interaction);

    if (interaction.isChatInputCommand() && interaction.guildId) {
      void AnalyticsModule.trackCommand(interaction.guildId);
    }
  },
};

export default event;
