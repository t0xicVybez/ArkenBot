import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { SUPPORTED_GAMES, AUTHENTICATED_GAMES, queryServer } from '../query.js';
import { getServers, getServerByName, addServer, removeServer, setPending } from '../utils/storage.js';
import { buildStatusEmbed, buildServerListEmbed, buildCheckAllEmbed } from '../utils/embeds.js';
import { canStoreCredentials, decryptCredential } from '../utils/crypto.js';
import { buildCredentialModal } from '../utils/modal.js';
import type { QueryAuth, SavedServer } from '../types.js';

/**
 * Rebuilds the auth needed to query a saved server, for games that have no
 * anonymous status protocol. Returns undefined for everything else.
 */
function authFor(server: SavedServer): QueryAuth | undefined {
  if (!server.credential) return undefined;
  return { password: decryptCredential(server.credential), queryPort: server.queryPort };
}

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Game server status commands')
    // ── /server status ──────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Check any game server by address')
        .addStringOption((o) =>
          o.setName('address').setDescription('Server IP or hostname').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('game')
            .setDescription('Game type (start typing to search)')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('port')
            .setDescription('Port number (uses default for game if omitted)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(65535),
        ),
    )
    // ── /server check ──────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('check')
        .setDescription('Check a saved server by name')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('Saved server name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    // ── /server add ────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Save a game server to this guild (requires Manage Server)')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('Friendly name for this server')
            .setRequired(true)
            .setMaxLength(50),
        )
        .addStringOption((o) =>
          o.setName('address').setDescription('Server IP or hostname').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('game')
            .setDescription('Game type (start typing to search)')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('port')
            .setDescription('Port number (uses default for game if omitted)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(65535),
        ),
    )
    // ── /server remove ─────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a saved server (requires Manage Server)')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('Name of the saved server')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    // ── /server list ───────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all saved game servers for this guild'),
    )
    // ── /server checkall ───────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('checkall').setDescription('Query all saved servers and show a status summary'),
    ) as unknown as SlashCommandBuilder,

  async execute(
    interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
    ctx: AddonContext,
  ) {
    if (!interaction.isChatInputCommand()) return;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    if (!interaction.guildId) {
      await interaction.reply({ content: t('mustBeInServer'), ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── status ─────────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const address = interaction.options.getString('address', true).trim();
      const game = interaction.options.getString('game', true);
      const port = interaction.options.getInteger('port') ?? undefined;

      if (!SUPPORTED_GAMES[game]) {
        await interaction.reply({ content: t('unknownGameTypePick'), ephemeral: true });
        return;
      }

      // Games with no anonymous query protocol need a password before we can ask
      // anything. showModal must be the first response, so this precedes the defer.
      if (AUTHENTICATED_GAMES.has(game)) {
        await setPending(ctx.storage, interaction.guildId, interaction.user.id, {
          action: 'status',
          game,
          host: address,
          port,
        });
        await interaction.showModal(buildCredentialModal('status', SUPPORTED_GAMES[game].label, t));
        return;
      }

      await interaction.deferReply();
      const status = await queryServer(game, address, port);
      await interaction.editReply({ embeds: [buildStatusEmbed(status, game, address, port, undefined, t)] });
      return;
    }

    // ── check ──────────────────────────────────────────────────────────────────
    if (sub === 'check') {
      const name = interaction.options.getString('name', true);
      const saved = await getServerByName(ctx.storage, interaction.guildId, name);
      if (!saved) {
        await interaction.reply({
          content: t('noSavedNamed', { name }),
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();
      const status = await queryServer(saved.game, saved.host, saved.port, authFor(saved));
      await interaction.editReply({
        embeds: [buildStatusEmbed(status, saved.game, saved.host, saved.port, saved.name, t)],
      });
      return;
    }

    // ── add ────────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: t('needManageSave'),
          ephemeral: true,
        });
        return;
      }

      const name = interaction.options.getString('name', true).trim();
      const address = interaction.options.getString('address', true).trim();
      const game = interaction.options.getString('game', true);
      const port = interaction.options.getInteger('port') ?? undefined;

      if (!SUPPORTED_GAMES[game]) {
        await interaction.reply({ content: t('unknownGameType'), ephemeral: true });
        return;
      }

      const existing = await getServerByName(ctx.storage, interaction.guildId, name);
      if (existing) {
        await interaction.reply({
          content: t('alreadyExists', { name }),
          ephemeral: true,
        });
        return;
      }

      const servers = await getServers(ctx.storage, interaction.guildId);
      if (servers.length >= 25) {
        await interaction.reply({ content: t('maxReached'), ephemeral: true });
        return;
      }

      if (AUTHENTICATED_GAMES.has(game)) {
        if (!canStoreCredentials()) {
          await interaction.reply({
            content: t('needEncryptionKey', { game: SUPPORTED_GAMES[game].label }),
            ephemeral: true,
          });
          return;
        }
        await setPending(ctx.storage, interaction.guildId, interaction.user.id, {
          action: 'add',
          name,
          game,
          host: address,
          port,
        });
        await interaction.showModal(buildCredentialModal('add', SUPPORTED_GAMES[game].label, t));
        return;
      }

      await interaction.deferReply();
      const status = await queryServer(game, address, port);

      await addServer(ctx.storage, interaction.guildId, {
        name,
        game,
        host: address,
        port,
        addedBy: interaction.user.id,
      });

      await interaction.editReply({
        content: t('savedUse', { name }),
        embeds: [buildStatusEmbed(status, game, address, port, name, t)],
      });
      return;
    }

    // ── remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: t('needManageRemove'),
          ephemeral: true,
        });
        return;
      }

      const name = interaction.options.getString('name', true);
      const removed = await removeServer(ctx.storage, interaction.guildId, name);
      if (!removed) {
        await interaction.reply({ content: t('noSavedNamedFound', { name }), ephemeral: true });
        return;
      }
      await interaction.reply(t('removed', { name }));
      return;
    }

    // ── list ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const servers = await getServers(ctx.storage, interaction.guildId);
      const embed = buildServerListEmbed(servers, interaction.guild?.name ?? t('thisServer'), t);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ── checkall ───────────────────────────────────────────────────────────────
    if (sub === 'checkall') {
      const servers = await getServers(ctx.storage, interaction.guildId);
      if (servers.length === 0) {
        await interaction.reply({
          content: t('noSavedYet'),
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();
      const results = await Promise.all(
        servers.map(async (s) => ({
          server: s,
          status: await queryServer(s.game, s.host, s.port, authFor(s)),
        })),
      );

      await interaction.editReply({ embeds: [buildCheckAllEmbed(results, interaction.guild?.name ?? t('thisServer'), t)] });
    }
  },
};

export default command;
