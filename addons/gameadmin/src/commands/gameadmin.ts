import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { GAMES, GAME_CHOICES, runGameCommand } from '../games.js';
import { canStoreCredentials, decryptCredential } from '../crypto.js';
import { getServers, findServer, deleteServer, setPending } from '../storage.js';
import { buildResultEmbed, buildServerListEmbed } from '../utils/embeds.js';
import { RconError } from '../rcon/source.js';

type Action = 'players' | 'say' | 'kick' | 'ban' | 'unban' | 'save' | 'stop';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('gameadmin')
    .setDescription('Control your game servers over RCON (Minecraft, Palworld, ARK, Rust, Valheim, 7DTD)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('add').setDescription('Add a game server (you will be asked for the RCON password privately)')
        .addStringOption((o) => o.setName('name').setDescription('A short name for this server').setRequired(true))
        .addStringOption((o) => o.setName('game').setDescription('Which game').setRequired(true).addChoices(...GAME_CHOICES))
        .addStringOption((o) => o.setName('host').setDescription('Server IP or hostname').setRequired(true))
        .addIntegerOption((o) => o.setName('port').setDescription('RCON/Telnet port (defaults to the game default)').setMinValue(1).setMaxValue(65535)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List the game servers configured in this server'))
    .addSubcommand((s) =>
      s.setName('remove').setDescription('Remove a configured game server')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) =>
      s.setName('exec').setDescription('Run a raw console command')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('command').setDescription('The console command to run').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('players').setDescription('List online players')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) =>
      s.setName('say').setDescription('Broadcast a message in-game')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('message').setDescription('The message to broadcast').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('kick').setDescription('Kick a player')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('player').setDescription('Player name or ID').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) =>
      s.setName('ban').setDescription('Ban a player')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('player').setDescription('Player name or ID').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) =>
      s.setName('unban').setDescription('Unban a player')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('player').setDescription('Player name or ID').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('save').setDescription('Save the world')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) =>
      s.setName('stop').setDescription('Stop / shut down the server')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand() || !interaction.guildId) return;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ── add: collect the password via a private modal ──
    if (sub === 'add') {
      if (!canStoreCredentials()) {
        await interaction.reply({ content: t('gameadmin.noKey'), flags: MessageFlags.Ephemeral });
        return;
      }
      const name = interaction.options.getString('name', true);
      const game = interaction.options.getString('game', true);
      const host = interaction.options.getString('host', true);
      const port = interaction.options.getInteger('port') ?? GAMES[game].defaultPort;
      if (await findServer(ctx.storage, guildId, name)) {
        await interaction.reply({ content: t('gameadmin.nameTaken', { name }), flags: MessageFlags.Ephemeral });
        return;
      }
      await setPending(ctx.storage, guildId, interaction.user.id, { name, game, host, port });
      const modal = new ModalBuilder().setCustomId('gameadmin:add:pw').setTitle(t('gameadmin.pwModalTitle'));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('password').setLabel(t('gameadmin.pwLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
        ),
      );
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'list') {
      const servers = await getServers(ctx.storage, guildId);
      await interaction.reply({ embeds: [buildServerListEmbed(servers, t)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'remove') {
      const server = await findServer(ctx.storage, guildId, interaction.options.getString('server', true));
      if (!server) { await interaction.reply({ content: t('gameadmin.notFound'), flags: MessageFlags.Ephemeral }); return; }
      await deleteServer(ctx.storage, guildId, server.id);
      await interaction.reply({ content: t('gameadmin.removed', { name: server.name }), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── everything else runs a command against a saved server ──
    const server = await findServer(ctx.storage, guildId, interaction.options.getString('server', true));
    if (!server) { await interaction.reply({ content: t('gameadmin.notFound'), flags: MessageFlags.Ephemeral }); return; }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let rawCommand: string;
    let title: string;
    const def = GAMES[server.game];
    try {
      if (sub === 'exec') {
        rawCommand = interaction.options.getString('command', true);
        title = t('gameadmin.execTitle', { server: server.name });
      } else {
        const action = sub as Action;
        const builder = def.cmd[action];
        if (!builder) {
          await interaction.editReply({ content: t('gameadmin.notSupported', { action, game: def.label }) });
          return;
        }
        if (action === 'say') rawCommand = (builder as (m: string) => string)(interaction.options.getString('message', true));
        else if (action === 'kick' || action === 'ban') rawCommand = (builder as (t: string, r?: string) => string)(interaction.options.getString('player', true), interaction.options.getString('reason') ?? undefined);
        else if (action === 'unban') rawCommand = (builder as (t: string) => string)(interaction.options.getString('player', true));
        else rawCommand = builder as string; // players / save / stop
        title = t(`gameadmin.titles.${action}`, { server: server.name });
      }

      const password = decryptCredential(server.password);
      const output = await runGameCommand(server.game, server.host, server.port, password, rawCommand);
      await interaction.editReply({ embeds: [buildResultEmbed(server, title, output, t)] });
    } catch (err) {
      const msg = err instanceof RconError ? err.message : (err as Error).message;
      await interaction.editReply({ embeds: [buildResultEmbed(server, t('gameadmin.errorTitle'), msg, t, true)] });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.guildId) { await interaction.respond([]); return; }
    const servers = await getServers(ctx.storage, interaction.guildId);
    const query = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      servers.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 25)
        .map((s) => ({ name: `${s.name} (${GAMES[s.game]?.label ?? s.game})`, value: s.name })),
    );
  },
};

export default command;
