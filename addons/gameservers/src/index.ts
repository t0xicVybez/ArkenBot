/**
 * Game Server Status addon entry point.
 * Registers the `/server` command and handles autocomplete for the `game`
 * and `name` fields using guild-saved server data.
 */
import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { AutocompleteInteraction, Interaction } from 'discord.js';

import serverCommand from './commands/server.js';
import { SUPPORTED_GAMES } from './query.js';
import { getServers } from './utils/storage.js';

export default defineAddon({
  manifest: {
    name: 'gameservers',
    displayName: 'Game Server Status',
    version: '1.0.0',
    description:
      'Check and monitor game server status for Minecraft, Rust, Valheim, ARK, CS2, Arma 3, FiveM, and 40+ other games. Save servers per-guild for quick lookups.',
    author: 't0xicVybez',
    commands: ['server'],
    settings: [],
  },

  commands: [serverCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;
        if (!interaction.isAutocomplete() || interaction.commandName !== 'server') return;
        await handleAutocomplete(ctx, interaction as AutocompleteInteraction);
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info(`Game Server Status addon loaded — ${Object.keys(SUPPORTED_GAMES).length} game types supported.`);
    },
  },
});

// ─── Autocomplete ─────────────────────────────────────────────────────────────

/**
 * Handles autocomplete for the `game` and `name` option fields.
 * - `game`: searches the full `SUPPORTED_GAMES` registry by key or label.
 * - `name`: searches saved servers for this guild by name.
 */
async function handleAutocomplete(
  ctx: AddonContext,
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const value = focused.value.toLowerCase();

  if (focused.name === 'game') {
    const matches = Object.entries(SUPPORTED_GAMES)
      .filter(
        ([key, info]) =>
          key.includes(value) || info.label.toLowerCase().includes(value),
      )
      .slice(0, 25)
      .map(([key, info]) => ({ name: `${info.emoji} ${info.label}`, value: key }));

    await interaction.respond(matches);
    return;
  }

  if (focused.name === 'name' && interaction.guildId) {
    const servers = await getServers(ctx.storage, interaction.guildId);
    const matches = servers
      .filter((s) => s.name.toLowerCase().includes(value))
      .slice(0, 25)
      .map((s) => {
        const info = SUPPORTED_GAMES[s.game];
        return {
          name: `${info?.emoji ?? '🎮'} ${s.name} (${info?.label ?? s.game})`,
          value: s.name,
        };
      });

    await interaction.respond(matches);
    return;
  }

  await interaction.respond([]);
}
