import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type TextChannel,
  type GuildMember,
  type Client,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { fetchServers, fetchServer, startServer, stopServer, sendCommand, fetchPlayers, restartServer, killServer, fetchLogs, captureCertificate } from '../utils/api.js';
import type { RsmConfig, RsmServer } from '../utils/api.js';

// ── Storage keys ──────────────────────────────────────────────────────────────
const CONFIG_KEY   = 'rsm:config';
const OPERATOR_KEY = 'rsm:operator-role';
const MONITOR_KEY  = 'rsm:monitor';

interface MonitorConfig {
  channelId: string;
  messageId: string | null;
  interval: number; // minutes
}

// ── Module-level state for the status-channel monitor ─────────────────────────
let _client: Client | null = null;
const activeMonitors = new Map<string, ReturnType<typeof setInterval>>();

// Called from index.ts on the ready event so the monitor can access channels.
export function initClient(client: Client): void {
  _client = client;
}

// Restores active monitors for all guilds after a bot restart.
export async function restoreMonitors(ctx: AddonContext): Promise<void> {
  if (!_client) return;
  for (const [guildId] of _client.guilds.cache) {
    const monitor = await ctx.storage.get<MonitorConfig>(MONITOR_KEY, guildId);
    if (monitor) startMonitor(ctx, guildId, monitor.interval);
  }
}

// ── Monitor helpers ───────────────────────────────────────────────────────────
function startMonitor(ctx: AddonContext, guildId: string, intervalMinutes: number): void {
  stopMonitor(guildId);
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const timer = setInterval(() => updateMonitorEmbed(ctx, guildId), ms);
  activeMonitors.set(guildId, timer);
}

function stopMonitor(guildId: string): void {
  const t = activeMonitors.get(guildId);
  if (t) { clearInterval(t); activeMonitors.delete(guildId); }
}

async function updateMonitorEmbed(ctx: AddonContext, guildId: string): Promise<void> {
  const monitorCfg = await ctx.storage.get<MonitorConfig>(MONITOR_KEY, guildId);
  const rsmCfg     = await ctx.storage.get<RsmConfig>(CONFIG_KEY, guildId);
  if (!monitorCfg || !rsmCfg || !_client) return;

  try {
    const servers = await fetchServers(rsmCfg);
    const lines = servers.map((s: RsmServer) => {
      const stats = [
        s.cpu   !== null ? `CPU ${s.cpu}%` : null,
        s.ramMB !== null ? `RAM ${s.ramMB > 1024 ? (s.ramMB / 1024).toFixed(1) + ' GB' : s.ramMB + ' MB'}` : null,
      ].filter(Boolean).join(' · ');
      return `${statusEmoji(s.status)} **${s.name}** \`${s.type}\` — ${s.status}${stats ? ` · ${stats}` : ''}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🖥️ Server Status')
      .setColor(0x5865F2)
      .setDescription(lines.length ? lines.join('\n') : 'No servers found.')
      .setFooter({ text: `Auto-updates every ${monitorCfg.interval} min` })
      .setTimestamp();

    const channel = _client.channels.cache.get(monitorCfg.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    if (monitorCfg.messageId) {
      try {
        const msg = await channel.messages.fetch(monitorCfg.messageId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch {
        // Message was deleted — fall through and post a new one
      }
    }

    const newMsg = await channel.send({ embeds: [embed] });
    monitorCfg.messageId = newMsg.id;
    await ctx.storage.set(MONITOR_KEY, monitorCfg, guildId);
  } catch {
    // Silently absorb — RSM or Discord may be temporarily unreachable
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────
async function getConfig(ctx: AddonContext, guildId: string): Promise<RsmConfig | null> {
  return ctx.storage.get<RsmConfig>(CONFIG_KEY, guildId);
}

function statusEmoji(status: string): string {
  if (status === 'Online')   return '🟢';
  if (status === 'Starting') return '🟡';
  return '🔴';
}

function statusColor(status: string): number {
  if (status === 'Online')   return 0x57F287;
  if (status === 'Starting') return 0xFEE75C;
  return 0xED4245;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function axiosErrorMessage(err: unknown): string {
  const e = err as { response?: { status: number; data?: { error?: string } }; message?: string };
  if (e.response?.data?.error)    return e.response.data.error;
  if (e.response?.status === 409) return 'Conflict — check server status.';
  if (e.response?.status === 404) return 'Server not found in RSM.';
  return e.message ?? 'Unknown error';
}

// Returns true if the member is an admin OR holds the configured operator role.
async function hasOperatorPermission(interaction: ChatInputCommandInteraction, ctx: AddonContext): Promise<boolean> {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = await ctx.storage.get<string>(OPERATOR_KEY, interaction.guildId!);
  if (!roleId) return false;
  return (interaction.member as GuildMember).roles.cache.has(roleId);
}

// ── Command definition ────────────────────────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName('rsm')
  .setDescription('Manage game servers via Ronin Server Manager')
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('List all managed game servers and their current status'))
  .addSubcommand(sub => sub
    .setName('start')
    .setDescription('Start a game server')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to start').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('stop')
    .setDescription('Stop a running game server')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to stop').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('Get detailed status of a game server')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to check').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('players')
    .setDescription('Show connected players on a game server')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to check').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('command')
    .setDescription('Send a console command to a game server')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to send the command to').setRequired(true).setAutocomplete(true))
    .addStringOption(opt => opt
      .setName('cmd').setDescription('Console command to send').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('setup')
    .setDescription('Configure the RSM connection for this server (Admin only)')
    .addStringOption(opt => opt
      .setName('url').setDescription('RSM API URL — e.g. https://your-pc-ip:3002').setRequired(true))
    .addStringOption(opt => opt
      .setName('apikey').setDescription('RSM API key from rsm-api.json in your AppData/Roaming folder').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('setrole')
    .setDescription('Set the operator role allowed to start/stop/command servers (Admin only)')
    .addRoleOption(opt => opt
      .setName('role').setDescription('Role to grant operator access (omit to clear)').setRequired(false)))
  .addSubcommand(sub => sub
    .setName('monitor')
    .setDescription('Post a live-updating server status embed in a channel (Admin only)')
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to post the status embed in')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .addIntegerOption(opt => opt
      .setName('interval')
      .setDescription('Update interval in minutes (default: 5)')
      .setMinValue(1)
      .setMaxValue(60)
      .setRequired(false)))
  .addSubcommand(sub => sub
    .setName('unmonitor')
    .setDescription('Stop the auto-updating server status channel (Admin only)'))
  .addSubcommand(sub => sub
    .setName('restart')
    .setDescription('Restart a game server (stop then start)')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to restart').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('logs')
    .setDescription('Show the last lines of a server\'s console log')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to fetch logs for').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('kill')
    .setDescription('Force-kill a server process immediately (use with caution)')
    .addStringOption(opt => opt
      .setName('server').setDescription('Server to kill').setRequired(true).setAutocomplete(true)));

// ── Handler ───────────────────────────────────────────────────────────────────
const serverCommand: AddonCommandDefinition = {
  data: data as unknown as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    const guildId = interaction.guildId!;
    const focused = interaction.options.getFocused().toLowerCase();
    const config  = await getConfig(ctx, guildId);
    if (!config) { await interaction.respond([]); return; }
    try {
      const servers  = await fetchServers(config);
      const choices  = servers
        .filter((s: RsmServer) => s.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((s: RsmServer) => ({ name: `${statusEmoji(s.status)} ${s.name} (${s.type})`, value: s.id }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    // Keep _client up to date in case ready fired before init
    if (!_client) _client = interaction.client;

    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ── Admin-only subcommands ─────────────────────────────────────────────
    if (['setup', 'setrole', 'monitor', 'unmonitor'].includes(sub)) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '❌ Administrator permission is required.', ephemeral: true });
        return;
      }
    }

    // setup ──────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const url    = interaction.options.getString('url', true).replace(/\/+$/, '');
      const apiKey = interaction.options.getString('apikey', true);
      await interaction.deferReply({ ephemeral: true });

      try {
        let serverCount: number;
        let cert: string | undefined;

        if (url.startsWith('https://')) {
          // Trust-on-first-use: capture the panel's self-signed certificate, then
          // pin every later request to it. A substituted certificate is rejected
          // from here on because it won't chain to this one.
          cert = await captureCertificate(url);
          const servers = await fetchServers({ url, apiKey, cert });
          serverCount = servers.length;
        } else {
          const servers = await fetchServers({ url, apiKey });
          serverCount = servers.length;
        }

        const config: RsmConfig = { url, apiKey, ...(cert ? { cert } : {}) };
        await ctx.storage.set(CONFIG_KEY, config, guildId);
        const certNote = cert ? '\n🔒 TLS certificate pinned' : '';
        await interaction.editReply(`✅ Connected to RSM — found **${serverCount}** server(s).${certNote}`);
      } catch {
        await interaction.editReply('❌ Could not connect to RSM. Check the URL and API key.');
      }
      return;
    }

    // setrole ────────────────────────────────────────────────────────────────
    if (sub === 'setrole') {
      const role = interaction.options.getRole('role');
      if (role) {
        await ctx.storage.set(OPERATOR_KEY, role.id, guildId);
        await interaction.reply({ content: `✅ Operator role set to **${role.name}**. Members with this role can start, stop, and send commands.`, ephemeral: true });
      } else {
        await ctx.storage.set(OPERATOR_KEY, null, guildId);
        await interaction.reply({ content: '✅ Operator role cleared. Only Administrators can now use destructive commands.', ephemeral: true });
      }
      return;
    }

    // monitor ────────────────────────────────────────────────────────────────
    if (sub === 'monitor') {
      const channel  = interaction.options.getChannel('channel', true) as TextChannel;
      const interval = interaction.options.getInteger('interval') ?? 5;
      await interaction.deferReply({ ephemeral: true });

      const config = await getConfig(ctx, guildId);
      if (!config) {
        await interaction.editReply('⚠️ RSM is not configured yet. Run `/rsm setup` first.');
        return;
      }

      const monitorCfg: MonitorConfig = { channelId: channel.id, messageId: null, interval };
      await ctx.storage.set(MONITOR_KEY, monitorCfg, guildId);
      startMonitor(ctx, guildId, interval);

      // Post the first embed immediately
      await updateMonitorEmbed(ctx, guildId);
      await interaction.editReply(`✅ Status monitor started in ${channel}. Updates every **${interval}** minute(s).`);
      return;
    }

    // unmonitor ──────────────────────────────────────────────────────────────
    if (sub === 'unmonitor') {
      stopMonitor(guildId);
      await ctx.storage.set(MONITOR_KEY, null, guildId);
      await interaction.reply({ content: '✅ Status monitor stopped.', ephemeral: true });
      return;
    }

    // ── Remaining subcommands require RSM config ───────────────────────────
    const config = await getConfig(ctx, guildId);
    if (!config) {
      await interaction.reply({ content: '⚠️ RSM is not configured yet. Ask an admin to run `/rsm setup` first.', ephemeral: true });
      return;
    }

    // ── Operator-only subcommands ──────────────────────────────────────────
    if (['start', 'stop', 'restart', 'command', 'logs', 'kill'].includes(sub)) {
      if (!await hasOperatorPermission(interaction, ctx)) {
        const roleId = await ctx.storage.get<string>(OPERATOR_KEY, guildId);
        const hint   = roleId ? ` You need the <@&${roleId}> role.` : ' No operator role has been configured — ask an admin to run `/rsm setrole`.';
        await interaction.reply({ content: `❌ You do not have permission to use this command.${hint}`, ephemeral: true });
        return;
      }
    }

    await interaction.deferReply();

    try {
      // list ─────────────────────────────────────────────────────────────────
      if (sub === 'list') {
        const servers = await fetchServers(config);
        if (servers.length === 0) { await interaction.editReply('No servers found in RSM.'); return; }
        const lines = servers.map((s: RsmServer) => {
          const stats = [
            s.cpu   !== null ? `CPU ${s.cpu}%` : null,
            s.ramMB !== null ? `RAM ${s.ramMB > 1024 ? (s.ramMB / 1024).toFixed(1) + ' GB' : s.ramMB + ' MB'}` : null,
          ].filter(Boolean).join(' · ');
          return `${statusEmoji(s.status)} **${s.name}** \`${s.type}\` — ${s.status}${stats ? ` · ${stats}` : ''}`;
        });
        const embed = new EmbedBuilder()
          .setTitle('🖥️ Game Servers')
          .setColor(0x5865F2)
          .setDescription(lines.join('\n'))
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // start ────────────────────────────────────────────────────────────────
      if (sub === 'start') {
        const id     = interaction.options.getString('server', true);
        const result = await startServer(config, id);
        await interaction.editReply(`✅ ${result.message}`);
        return;
      }

      // stop ─────────────────────────────────────────────────────────────────
      if (sub === 'stop') {
        const id     = interaction.options.getString('server', true);
        const result = await stopServer(config, id);
        await interaction.editReply(`🛑 ${result.message}`);
        return;
      }

      // status ───────────────────────────────────────────────────────────────
      if (sub === 'status') {
        const id  = interaction.options.getString('server', true);
        const srv = await fetchServer(config, id);
        const ramDisplay = srv.ramMB !== null
          ? (srv.ramMB > 1024 ? (srv.ramMB / 1024).toFixed(2) + ' GB' : srv.ramMB + ' MB')
          : '—';
        const embed = new EmbedBuilder()
          .setTitle(`${statusEmoji(srv.status)} ${srv.name}`)
          .setColor(statusColor(srv.status))
          .addFields(
            { name: 'Status', value: srv.status,                          inline: true },
            { name: 'Type',   value: srv.type,                            inline: true },
            { name: 'PID',    value: srv.pid?.toString() ?? '—',          inline: true },
            { name: 'CPU',    value: srv.cpu !== null ? `${srv.cpu}%` : '—', inline: true },
            { name: 'RAM',    value: ramDisplay,                          inline: true },
            { name: 'Uptime', value: formatUptime(srv.uptimeSeconds),     inline: true },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // players ──────────────────────────────────────────────────────────────
      if (sub === 'players') {
        const id  = interaction.options.getString('server', true);
        const srv = await fetchServer(config, id);
        const pl  = await fetchPlayers(config, id);

        const countLine = pl.online !== null
          ? `**${pl.online}${pl.max !== null ? ` / ${pl.max}` : ''}** player(s) online`
          : 'Player count unavailable';

        const embed = new EmbedBuilder()
          .setTitle(`👥 ${srv.name}`)
          .setColor(statusColor(srv.status))
          .setTimestamp();

        if (pl.note) {
          embed.setDescription(`${countLine}\n\n*${pl.note}*`);
        } else if (pl.players.length > 0) {
          embed.setDescription(`${countLine}\n\n${pl.players.map(p => `• ${p}`).join('\n')}`);
        } else {
          embed.setDescription(`${countLine}\n\nNo players currently online.`);
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // command ──────────────────────────────────────────────────────────────
      if (sub === 'command') {
        const id     = interaction.options.getString('server', true);
        const cmd    = interaction.options.getString('cmd', true);
        const result = await sendCommand(config, id, cmd);
        const output = result.output.slice(0, 1990);
        await interaction.editReply(
          result.success ? `\`\`\`\n${output}\n\`\`\`` : `❌ ${output}`
        );
        return;
      }

      // restart ──────────────────────────────────────────────────────────────
      if (sub === 'restart') {
        const id     = interaction.options.getString('server', true);
        const result = await restartServer(config, id);
        await interaction.editReply(`🔄 ${result.message}`);
        return;
      }

      // logs ─────────────────────────────────────────────────────────────────
      if (sub === 'logs') {
        const id   = interaction.options.getString('server', true);
        const data = await fetchLogs(config, id);
        const trimmed = data.log.length > 1800 ? '…' + data.log.slice(-1800) : data.log;
        const embed = new EmbedBuilder()
          .setTitle(`📋 Console Log — ${id}`)
          .setColor(0x5865F2)
          .setDescription(`\`\`\`\n${trimmed || '(empty)'}\n\`\`\``)
          .setFooter({ text: `${data.totalLines} total lines` })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // kill ─────────────────────────────────────────────────────────────────
      if (sub === 'kill') {
        const id     = interaction.options.getString('server', true);
        const result = await killServer(config, id);
        await interaction.editReply(`⚠️ ${result.message}\nUse \`/rsm start\` to restart it.`);
        return;
      }

    } catch (err: unknown) {
      await interaction.editReply(`❌ RSM error: ${axiosErrorMessage(err)}`);
    }
  },
};

export default serverCommand;
