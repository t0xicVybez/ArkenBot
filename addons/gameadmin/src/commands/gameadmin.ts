import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
  type TextChannel,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { GAMES, GAME_CHOICES, runGameCommand } from '../games.js';
import { canStoreCredentials, decryptCredential } from '../crypto.js';
import { getServers, findServer, deleteServer, setPending } from '../storage.js';
import { buildResultEmbed, buildServerListEmbed } from '../utils/embeds.js';
import {
  getConfig, setConfig, getSchedules, setSchedules, postAudit, resolvePlayerTarget,
  SCHEDULE_INTERVALS, type Schedule, type ScheduleAction,
} from '../admin.js';
import { buildControlPanel } from '../panel.js';
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
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true)))
    // ── control panel + audit + scheduling ──────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('panel').setDescription('Post a control panel with buttons for a server')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) =>
      s.setName('logchannel').setDescription('Log every RCON action to a channel (or clear it)')
        .addChannelOption((o) => o.setName('channel').setDescription('Audit-log channel (leave empty to clear)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) =>
      s.setName('schedule').setDescription('Run a recurring action (save/restart/broadcast) on a server')
        .addStringOption((o) => o.setName('server').setDescription('Which server').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('action').setDescription('What to run').setRequired(true)
          .addChoices({ name: 'Save', value: 'save' }, { name: 'Restart (warn → save → stop)', value: 'restart' }, { name: 'Broadcast a message', value: 'broadcast' }))
        .addStringOption((o) => o.setName('every').setDescription('How often').setRequired(true)
          .addChoices({ name: 'Hourly', value: 'hourly' }, { name: 'Every 6 hours', value: 'every6h' }, { name: 'Every 12 hours', value: 'every12h' }, { name: 'Daily', value: 'daily' }))
        .addStringOption((o) => o.setName('message').setDescription('Message (for broadcast)')))
    .addSubcommand((s) =>
      s.setName('schedules').setDescription('List scheduled actions for this server'))
    .addSubcommand((s) =>
      s.setName('unschedule').setDescription('Remove a scheduled action')
        .addStringOption((o) => o.setName('id').setDescription('Schedule ID (from /gameadmin schedules)').setRequired(true))) as unknown as SlashCommandBuilder,

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

    if (sub === 'panel') {
      const server = await findServer(ctx.storage, guildId, interaction.options.getString('server', true));
      if (!server) { await interaction.reply({ content: t('gameadmin.notFound'), flags: MessageFlags.Ephemeral }); return; }
      const { embeds, components } = buildControlPanel(server, t);
      await interaction.reply({ embeds, components });
      return;
    }

    if (sub === 'logchannel') {
      const channel = interaction.options.getChannel('channel') as TextChannel | null;
      const cfg = await getConfig(ctx.storage, guildId);
      cfg.logChannelId = channel?.id;
      await setConfig(ctx.storage, guildId, cfg);
      await interaction.reply({
        content: channel ? t('gameadmin.logChannelSet', { channel: `<#${channel.id}>` }) : t('gameadmin.logChannelCleared'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'schedule') {
      const server = await findServer(ctx.storage, guildId, interaction.options.getString('server', true));
      if (!server) { await interaction.reply({ content: t('gameadmin.notFound'), flags: MessageFlags.Ephemeral }); return; }
      const action = interaction.options.getString('action', true) as ScheduleAction;
      const every = interaction.options.getString('every', true);
      const message = interaction.options.getString('message') ?? undefined;
      const intervalMs = SCHEDULE_INTERVALS[every];
      if (!intervalMs) { await interaction.reply({ content: t('gameadmin.scheduleBadInterval'), flags: MessageFlags.Ephemeral }); return; }
      if (action === 'broadcast' && !message) { await interaction.reply({ content: t('gameadmin.scheduleNeedMessage'), flags: MessageFlags.Ephemeral }); return; }
      const schedules = await getSchedules(ctx.storage, guildId);
      if (schedules.length >= 25) { await interaction.reply({ content: t('gameadmin.scheduleMax'), flags: MessageFlags.Ephemeral }); return; }
      const sch: Schedule = { id: randomUUID().slice(0, 8), serverId: server.id, action, message, intervalMs, nextRun: Date.now() + intervalMs };
      schedules.push(sch);
      await setSchedules(ctx.storage, guildId, schedules);
      await interaction.reply({
        content: t('gameadmin.scheduleAdded', { action, server: server.name, every: t(`gameadmin.every.${every}`), id: sch.id }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'schedules') {
      const schedules = await getSchedules(ctx.storage, guildId);
      if (schedules.length === 0) { await interaction.reply({ content: t('gameadmin.scheduleListEmpty'), flags: MessageFlags.Ephemeral }); return; }
      const servers = await getServers(ctx.storage, guildId);
      const lines = schedules.map((s) => {
        const srv = servers.find((x) => x.id === s.serverId);
        return t('gameadmin.scheduleLine', { id: s.id, action: s.action, server: srv?.name ?? s.serverId, next: `<t:${Math.floor(s.nextRun / 1000)}:R>` });
      });
      await interaction.reply({ content: `${t('gameadmin.scheduleListHeader')}\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'unschedule') {
      const id = interaction.options.getString('id', true);
      const schedules = await getSchedules(ctx.storage, guildId);
      const next = schedules.filter((s) => s.id !== id);
      if (next.length === schedules.length) { await interaction.reply({ content: t('gameadmin.scheduleNotFound'), flags: MessageFlags.Ephemeral }); return; }
      await setSchedules(ctx.storage, guildId, next);
      await interaction.reply({ content: t('gameadmin.scheduleRemoved', { id }), flags: MessageFlags.Ephemeral });
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
        else if (action === 'kick' || action === 'ban') {
          const target = await resolvePlayerTarget(server, interaction.options.getString('player', true));
          rawCommand = (builder as (t: string, r?: string) => string)(target, interaction.options.getString('reason') ?? undefined);
        } else if (action === 'unban') {
          const target = await resolvePlayerTarget(server, interaction.options.getString('player', true));
          rawCommand = (builder as (t: string) => string)(target);
        }
        else rawCommand = builder as string; // players / save / stop
        title = t(`gameadmin.titles.${action}`, { server: server.name });
      }

      const password = decryptCredential(server.password);
      const output = await runGameCommand(server.game, server.host, server.port, password, rawCommand);
      await interaction.editReply({ embeds: [buildResultEmbed(server, title, output, t)] });
      if (interaction.guild) await postAudit(ctx, interaction.guild, { userId: interaction.user.id, server, action: sub === 'exec' ? rawCommand : sub, ok: true });
    } catch (err) {
      const msg = err instanceof RconError ? err.message : (err as Error).message;
      await interaction.editReply({ embeds: [buildResultEmbed(server, t('gameadmin.errorTitle'), msg, t, true)] });
      if (interaction.guild) await postAudit(ctx, interaction.guild, { userId: interaction.user.id, server, action: sub, detail: msg, ok: false });
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
