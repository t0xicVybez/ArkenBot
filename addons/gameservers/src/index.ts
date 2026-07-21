/**
 * Game Server Status addon entry point.
 * Registers the `/server` command and handles autocomplete for the `game`
 * and `name` fields using guild-saved server data.
 */
import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { MessageFlags, type AutocompleteInteraction, type Interaction, type ModalSubmitInteraction } from 'discord.js';

import serverCommand from './commands/server.js';
import { SUPPORTED_GAMES, PALWORLD_REST_PORT, queryServer } from './query.js';
import { getServers, addServer, takePending } from './utils/storage.js';
import { buildStatusEmbed } from './utils/embeds.js';
import { encryptCredential } from './utils/crypto.js';
import { CREDENTIAL_MODAL_PREFIX, FIELD_PASSWORD, FIELD_QUERY_PORT } from './utils/modal.js';

export default defineAddon({
  manifest: {
    name: 'gameservers',
    displayName: 'Game Server Status',
    version: '1.0.0',
    description:
      'Check and monitor game server status for Minecraft, Rust, Palworld, Valheim, ARK, CS2, Arma 3, FiveM and 53 games in total. Save servers per-guild for quick lookups. Powered by GameQuery (query.arkenbot.app), our own dependency-free query library.',
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

        if (interaction.isAutocomplete() && interaction.commandName === 'server') {
          await handleAutocomplete(ctx, interaction as AutocompleteInteraction);
          return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith(CREDENTIAL_MODAL_PREFIX)) {
          await handleCredentialModal(ctx, interaction);
        }
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info(`Game Server Status addon loaded — ${Object.keys(SUPPORTED_GAMES).length} game types supported.`);
    },
  },
});

// ─── Credential modal ─────────────────────────────────────────────────────────

/**
 * Completes an `/server add` or `/server status` that was parked waiting for an
 * admin password — the games that need one (Palworld) have no anonymous status
 * protocol, and a password can't be a slash option because Discord shows those
 * to the whole channel.
 */
async function handleCredentialModal(
  ctx: AddonContext,
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.guildId) return;

  const pending = await takePending(ctx.storage, interaction.guildId, interaction.user.id);
  if (!pending) {
    await interaction.reply({
      content: '❌ That request expired. Run the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const password = interaction.fields.getTextInputValue(FIELD_PASSWORD).trim();
  const rawPort = interaction.fields.getTextInputValue(FIELD_QUERY_PORT).trim();
  const queryPort = rawPort ? Number(rawPort) : PALWORLD_REST_PORT;

  if (!Number.isInteger(queryPort) || queryPort < 1 || queryPort > 65535) {
    await interaction.reply({
      content: `❌ \`${rawPort}\` is not a valid port.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  const { game, host, port } = pending;
  const status = await queryServer(game, host, port, { password, queryPort });

  // Only persist a credential that we know actually works.
  if (pending.action === 'add') {
    if (!status.online) {
      await interaction.editReply({
        content: `❌ **${pending.name}** was not saved — the server could not be queried.`,
        embeds: [buildStatusEmbed(status, game, host, port, pending.name)],
      });
      return;
    }

    await addServer(ctx.storage, interaction.guildId, {
      name: pending.name!,
      game,
      host,
      port,
      addedBy: interaction.user.id,
      credential: encryptCredential(password),
      queryPort,
    });

    await interaction.editReply({
      content: `✅ **${pending.name}** saved! Use \`/server check ${pending.name}\` to query it anytime.`,
      embeds: [buildStatusEmbed(status, game, host, port, pending.name)],
    });
    return;
  }

  await interaction.editReply({ embeds: [buildStatusEmbed(status, game, host, port)] });
}

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
