import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { fetchServers, fetchServer, startServer, stopServer, sendCommand } from '../utils/api.js';
import type { RsmConfig, RsmServer } from '../utils/api.js';

const CONFIG_KEY = 'rsm:config';

async function getConfig(ctx: AddonContext, guildId: string): Promise<RsmConfig | null> {
  return ctx.storage.get<RsmConfig>(CONFIG_KEY, guildId);
}

function statusEmoji(status: string): string {
  if (status === 'Online') return '🟢';
  if (status === 'Starting') return '🟡';
  return '🔴';
}

function statusColor(status: string): number {
  if (status === 'Online') return 0x57F287;
  if (status === 'Starting') return 0xFEE75C;
  return 0xED4245;
}

function axiosErrorMessage(err: unknown): string {
  const e = err as { response?: { status: number; data?: { error?: string } }; message?: string };
  if (e.response?.data?.error) return e.response.data.error;
  if (e.response?.status === 409) return 'Conflict — check server status.';
  if (e.response?.status === 404) return 'Server not found in RSM.';
  return e.message ?? 'Unknown error';
}

const data = new SlashCommandBuilder()
  .setName('server')
  .setDescription('Manage game servers via Ronin Server Manager')
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('List all managed game servers and their current status'))
  .addSubcommand(sub => sub
    .setName('start')
    .setDescription('Start a game server')
    .addStringOption(opt => opt
      .setName('server')
      .setDescription('Server to start')
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('stop')
    .setDescription('Stop a running game server')
    .addStringOption(opt => opt
      .setName('server')
      .setDescription('Server to stop')
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('Get detailed status of a game server')
    .addStringOption(opt => opt
      .setName('server')
      .setDescription('Server to check')
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('command')
    .setDescription('Send a console command to a game server')
    .addStringOption(opt => opt
      .setName('server')
      .setDescription('Server to send the command to')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption(opt => opt
      .setName('cmd')
      .setDescription('Console command to send')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('setup')
    .setDescription('Configure the RSM connection for this server (Admin only)')
    .addStringOption(opt => opt
      .setName('url')
      .setDescription('RSM API URL — e.g. http://your-pc-ip:3002')
      .setRequired(true))
    .addStringOption(opt => opt
      .setName('apikey')
      .setDescription('RSM API key from rsm-api.json in your AppData/Roaming folder')
      .setRequired(true)));

const serverCommand: AddonCommandDefinition = {
  data: data as unknown as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    const guildId = interaction.guildId!;
    const focused = interaction.options.getFocused().toLowerCase();
    const config = await getConfig(ctx, guildId);
    if (!config) { await interaction.respond([]); return; }

    try {
      const servers = await fetchServers(config);
      const choices = servers
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

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '❌ Administrator permission is required to configure RSM.', ephemeral: true });
        return;
      }
      const url = interaction.options.getString('url', true).replace(/\/+$/, '');
      const apiKey = interaction.options.getString('apikey', true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const config: RsmConfig = { url, apiKey };
        const servers = await fetchServers(config);
        await ctx.storage.set(CONFIG_KEY, config, guildId);
        await interaction.editReply(`✅ Connected to RSM — found **${servers.length}** server(s). You can now use \`/server\` commands.`);
      } catch {
        await interaction.editReply('❌ Could not connect to RSM. Check the URL and API key, and make sure the port is reachable.');
      }
      return;
    }

    const config = await getConfig(ctx, guildId);
    if (!config) {
      await interaction.reply({ content: '⚠️ RSM is not configured yet. Ask an admin to run `/server setup` first.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      if (sub === 'list') {
        const servers = await fetchServers(config);
        if (servers.length === 0) {
          await interaction.editReply('No servers found in RSM.');
          return;
        }
        const lines = servers.map((s: RsmServer) => {
          const stats = [
            s.cpu !== null ? `CPU ${s.cpu}%` : null,
            s.ramMB !== null
              ? `RAM ${s.ramMB > 1024 ? (s.ramMB / 1024).toFixed(1) + ' GB' : s.ramMB + ' MB'}`
              : null,
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

      if (sub === 'start') {
        const id = interaction.options.getString('server', true);
        const result = await startServer(config, id);
        await interaction.editReply(`✅ ${result.message}`);
        return;
      }

      if (sub === 'stop') {
        const id = interaction.options.getString('server', true);
        const result = await stopServer(config, id);
        await interaction.editReply(`🛑 ${result.message}`);
        return;
      }

      if (sub === 'status') {
        const id = interaction.options.getString('server', true);
        const srv = await fetchServer(config, id);
        const ramDisplay = srv.ramMB !== null
          ? (srv.ramMB > 1024 ? (srv.ramMB / 1024).toFixed(2) + ' GB' : srv.ramMB + ' MB')
          : '—';
        const embed = new EmbedBuilder()
          .setTitle(`${statusEmoji(srv.status)} ${srv.name}`)
          .setColor(statusColor(srv.status))
          .addFields(
            { name: 'Status', value: srv.status, inline: true },
            { name: 'Type', value: srv.type, inline: true },
            { name: 'PID', value: srv.pid?.toString() ?? '—', inline: true },
            { name: 'CPU', value: srv.cpu !== null ? `${srv.cpu}%` : '—', inline: true },
            { name: 'RAM', value: ramDisplay, inline: true },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (sub === 'command') {
        const id = interaction.options.getString('server', true);
        const cmd = interaction.options.getString('cmd', true);
        const result = await sendCommand(config, id, cmd);
        const output = result.output.slice(0, 1990);
        await interaction.editReply(
          result.success ? `\`\`\`\n${output}\n\`\`\`` : `❌ ${output}`
        );
        return;
      }

    } catch (err: unknown) {
      await interaction.editReply(`❌ RSM error: ${axiosErrorMessage(err)}`);
    }
  },
};

export default serverCommand;
