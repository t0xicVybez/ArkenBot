import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonCommandDefinition, AddonContext } from '@arkenbot/addon-sdk';
import { palApi } from '../utils/api.js';

// ─── Config type ──────────────────────────────────────────────────────────────

export interface PalworldConfig {
  host: string;
  port: number;
  password: string;
  staffRoles: string[];
  adminRoles: string[];
}

// ─── API response types ───────────────────────────────────────────────────────

interface PalworldInfo {
  version: string;
  servername: string;
  description: string;
}

interface PalworldPlayer {
  playerid: string;
  name: string;
  userid: string;
  ip: string;
  ping: number;
  location_x: number;
  location_y: number;
}

interface PalworldPlayersResponse {
  players: PalworldPlayer[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig(ctx: AddonContext, guildId: string): Promise<PalworldConfig | null> {
  return ctx.storage.get<PalworldConfig>('config', guildId);
}

function hasRole(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  roles: string[],
): boolean {
  if (!roles.length) return false;
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  return member?.roles.cache.some((r) => roles.includes(r.id)) ?? false;
}

function isStaff(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  cfg: PalworldConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, [...cfg.staffRoles, ...cfg.adminRoles]);
}

function isAdmin(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  cfg: PalworldConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, cfg.adminRoles);
}

// ─── Command definition ───────────────────────────────────────────────────────

const command: AddonCommandDefinition = {
  data: (new SlashCommandBuilder()
    .setName('palworld')
    .setDescription('Palworld server management')

    // ── Config ───────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Configure Palworld server connection (admin only)')
        .addStringOption((o) =>
          o.setName('host').setDescription('Server IP or hostname').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('password').setDescription('Admin password').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('port').setDescription('REST API port (default: 8212)').setRequired(false).setMinValue(1).setMaxValue(65535),
        )
        .addRoleOption((o) =>
          o.setName('staff_role').setDescription('Role allowed to use staff commands').setRequired(false),
        )
        .addRoleOption((o) =>
          o.setName('admin_role').setDescription('Role allowed to use admin commands').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s.setName('disable').setDescription('Disable the Palworld integration for this server (admin only)'),
    )

    // ── Info ─────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('status').setDescription('Show Palworld server status'),
    )

    .addSubcommand((s) =>
      s.setName('players').setDescription('List players currently online'),
    )

    // ── Moderation ───────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('kick')
        .setDescription('Kick a player from the server')
        .addStringOption((o) =>
          o.setName('playerid').setDescription('Player ID').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Kick reason').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('ban')
        .setDescription('Ban a player from the server')
        .addStringOption((o) =>
          o.setName('playerid').setDescription('Player ID').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Ban reason').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('broadcast')
        .setDescription('Send an announcement to all players (staff only)')
        .addStringOption((o) =>
          o.setName('message').setDescription('Message to broadcast').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s.setName('save').setDescription('Save the world (admin only)'),
    )

    .addSubcommand((s) =>
      s
        .setName('shutdown')
        .setDescription('Shut down the server gracefully (admin only)')
        .addIntegerOption((o) =>
          o.setName('time').setDescription('Wait time in seconds before shutdown (default: 30)').setRequired(false).setMinValue(0),
        )
        .addStringOption((o) =>
          o.setName('message').setDescription('Shutdown message shown to players').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('rcon')
        .setDescription('Execute a raw server command (admin only)')
        .addStringOption((o) =>
          o.setName('command').setDescription('Command to execute').setRequired(true),
        ),
    )
  ) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;

    const sub      = interaction.options.getSubcommand();
    const guildId  = interaction.guildId!;
    const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

    // ── /palworld setup ───────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can configure this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const host      = interaction.options.getString('host', true);
      const port      = interaction.options.getInteger('port') ?? 8212;
      const password  = interaction.options.getString('password', true);
      const staffRole = interaction.options.getRole('staff_role');
      const adminRole = interaction.options.getRole('admin_role');

      const existing = await getConfig(ctx, guildId);

      const staffRoles = existing?.staffRoles ? [...existing.staffRoles] : [];
      const adminRoles = existing?.adminRoles ? [...existing.adminRoles] : [];

      if (staffRole && !staffRoles.includes(staffRole.id)) staffRoles.push(staffRole.id);
      if (adminRole && !adminRoles.includes(adminRole.id)) adminRoles.push(adminRole.id);

      const cfg: PalworldConfig = { host, port, password, staffRoles, adminRoles };
      await ctx.storage.set('config', cfg, guildId);

      const lines = [
        'Palworld integration configured.',
        `**Host:** \`${host}:${port}\``,
        `**Admin password:** set`,
        `**Staff roles:** ${staffRoles.length ? staffRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
        `**Admin roles:** ${adminRoles.length ? adminRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
      ];

      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── /palworld disable ─────────────────────────────────────────────────────
    if (sub === 'disable') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can do this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await ctx.storage.delete('config', guildId);
      await interaction.reply({ content: 'Palworld integration disabled.', flags: MessageFlags.Ephemeral });
      return;
    }

    // All other subcommands require config
    const cfg = await getConfig(ctx, guildId);
    if (!cfg) {
      await interaction.reply({
        content: 'Palworld is not configured. An admin must run `/palworld setup` first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isStaff(interaction, cfg)) {
      await interaction.reply({
        content: 'You do not have permission to use Palworld commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ephemeral = sub !== 'status' && sub !== 'players';
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    try {
      // ── /palworld status ──────────────────────────────────────────────────
      if (sub === 'status') {
        const info = await palApi<PalworldInfo>(cfg.host, cfg.port, cfg.password, 'GET', '/v1/api/info');

        const embed = new EmbedBuilder()
          .setTitle('Palworld Server Status')
          .setColor(0x00c853)
          .addFields(
            { name: 'Server Name', value: info.servername || 'Unknown', inline: false },
            { name: 'Version',     value: info.version    || 'Unknown', inline: true },
            { name: 'Status',      value: 'Online',                     inline: true },
          )
          .setTimestamp();

        if (info.description) {
          embed.addFields({ name: 'Description', value: info.description, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /palworld players ─────────────────────────────────────────────────
      if (sub === 'players') {
        const data = await palApi<PalworldPlayersResponse>(cfg.host, cfg.port, cfg.password, 'GET', '/v1/api/players');
        const players = data?.players ?? [];

        if (players.length === 0) {
          await interaction.editReply('No players currently online.');
          return;
        }

        const list = players
          .slice(0, 40)
          .map((p, i) => `\`${String(i + 1).padStart(2)}.\` **${p.name}** — ID: \`${p.playerid}\` — Ping: ${p.ping}ms`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`Online Players — ${players.length}`)
          .setDescription(list + (players.length > 40 ? `\n_…and ${players.length - 40} more_` : ''))
          .setColor(0x1565c0)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /palworld kick ────────────────────────────────────────────────────
      if (sub === 'kick') {
        const playerid = interaction.options.getString('playerid', true);
        const message  = interaction.options.getString('reason') ?? 'Kicked by staff';
        await palApi(cfg.host, cfg.port, cfg.password, 'POST', '/v1/api/kick', { playerid, message });
        await interaction.editReply(`Player \`${playerid}\` kicked. Reason: ${message}`);
        return;
      }

      // ── /palworld broadcast ───────────────────────────────────────────────
      if (sub === 'broadcast') {
        const message = interaction.options.getString('message', true);
        await palApi(cfg.host, cfg.port, cfg.password, 'POST', '/v1/api/announce', { message });
        await interaction.editReply('Announcement sent.');
        return;
      }

      // ── Admin-only below ───────────────────────────────────────────────────
      if (!isAdmin(interaction, cfg)) {
        await interaction.editReply('You need an admin role to use this command.');
        return;
      }

      if (sub === 'ban') {
        const playerid = interaction.options.getString('playerid', true);
        const message  = interaction.options.getString('reason') ?? 'Banned by staff';
        await palApi(cfg.host, cfg.port, cfg.password, 'POST', '/v1/api/ban', { playerid, message });
        await interaction.editReply(`Player \`${playerid}\` banned. Reason: ${message}`);
        return;
      }

      if (sub === 'save') {
        await palApi(cfg.host, cfg.port, cfg.password, 'POST', '/v1/api/save');
        await interaction.editReply('World saved.');
        return;
      }

      if (sub === 'shutdown') {
        const waittime = interaction.options.getInteger('time') ?? 30;
        const message  = interaction.options.getString('message') ?? 'Server shutting down';
        await palApi(cfg.host, cfg.port, cfg.password, 'POST', '/v1/api/stop', { waittime, message });
        await interaction.editReply(`Server will shut down in ${waittime} seconds. Message: "${message}"`);
        return;
      }

      if (sub === 'rcon') {
        const rawCommand = interaction.options.getString('command', true);
        const result = await palApi<{ result?: string }>(cfg.host, cfg.port, cfg.password, 'POST', '/v1/api/command', { command: rawCommand });
        await interaction.editReply(
          result?.result
            ? `**Result:**\n\`\`\`\n${result.result.slice(0, 1800)}\n\`\`\``
            : `Executed: \`${rawCommand}\``,
        );
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Error: ${msg}`);
    }
  },
};

export default command;
