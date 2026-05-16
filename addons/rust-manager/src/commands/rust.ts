import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonCommandDefinition, AddonContext } from '@arkenbot/addon-sdk';
import { sendRustRcon } from '../utils/rcon.js';

// ─── Config type ──────────────────────────────────────────────────────────────

export interface RustConfig {
  host: string;
  port: number;
  password: string;
  staffRoles: string[];
  adminRoles: string[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RustPlayer {
  SteamID: string;
  Username: string;
  Ping?: number;
  Address?: string;
  ConnectedSeconds?: number;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig(ctx: AddonContext, guildId: string): Promise<RustConfig | null> {
  return ctx.storage.get<RustConfig>('config', guildId);
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
  cfg: RustConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, [...cfg.staffRoles, ...cfg.adminRoles]);
}

function isAdmin(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  cfg: RustConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, cfg.adminRoles);
}

/** Parse playerlist response — may be JSON array or plain text */
function parsePlayerList(response: string): RustPlayer[] {
  const trimmed = response.trim();
  if (!trimmed || trimmed === '[]') return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as RustPlayer[];
  } catch { /* fall through to plain text parse */ }
  // Plain text fallback: "SteamID Username"
  const players: RustPlayer[] = [];
  for (const line of trimmed.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      players.push({ SteamID: parts[0] ?? '', Username: parts.slice(1).join(' ') });
    }
  }
  return players;
}

// ─── Command definition ───────────────────────────────────────────────────────

const command: AddonCommandDefinition = {
  data: (new SlashCommandBuilder()
    .setName('rust')
    .setDescription('Rust server management')

    // ── Config ───────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Configure Rust server connection (admin only)')
        .addStringOption((o) =>
          o.setName('host').setDescription('Server IP or hostname').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('password').setDescription('RCON password').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('port').setDescription('WebSocket RCON port (default: 28016)').setRequired(false).setMinValue(1).setMaxValue(65535),
        )
        .addRoleOption((o) =>
          o.setName('staff_role').setDescription('Role allowed to use staff commands').setRequired(false),
        )
        .addRoleOption((o) =>
          o.setName('admin_role').setDescription('Role allowed to use admin commands').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s.setName('disable').setDescription('Disable the Rust integration for this server (admin only)'),
    )

    // ── Info ─────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('status').setDescription('Show Rust server status'),
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
          o.setName('player').setDescription('Steam64 ID or player name').setRequired(true),
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
          o.setName('player').setDescription('Steam64 ID or player name').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Ban reason').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('unban')
        .setDescription('Unban a player (admin only)')
        .addStringOption((o) =>
          o.setName('player').setDescription('Steam64 ID or player name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('broadcast')
        .setDescription('Send a message to all players (staff only)')
        .addStringOption((o) =>
          o.setName('message').setDescription('Message to broadcast').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('give')
        .setDescription('Give an item to a player by Steam ID (admin only)')
        .addStringOption((o) =>
          o.setName('steamid').setDescription('Player Steam64 ID').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('item').setDescription('Item short name, e.g. rifle.ak').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Amount (default: 1)').setRequired(false).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('rcon')
        .setDescription('Execute a raw RCON command (admin only)')
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

    // ── /rust setup ───────────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can configure this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const host      = interaction.options.getString('host', true);
      const port      = interaction.options.getInteger('port') ?? 28016;
      const password  = interaction.options.getString('password', true);
      const staffRole = interaction.options.getRole('staff_role');
      const adminRole = interaction.options.getRole('admin_role');

      const existing = await getConfig(ctx, guildId);

      const staffRoles = existing?.staffRoles ? [...existing.staffRoles] : [];
      const adminRoles = existing?.adminRoles ? [...existing.adminRoles] : [];

      if (staffRole && !staffRoles.includes(staffRole.id)) staffRoles.push(staffRole.id);
      if (adminRole && !adminRoles.includes(adminRole.id)) adminRoles.push(adminRole.id);

      const cfg: RustConfig = { host, port, password, staffRoles, adminRoles };
      await ctx.storage.set('config', cfg, guildId);

      const lines = [
        'Rust integration configured.',
        `**Host:** \`${host}:${port}\``,
        `**RCON password:** set`,
        `**Staff roles:** ${staffRoles.length ? staffRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
        `**Admin roles:** ${adminRoles.length ? adminRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
      ];

      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── /rust disable ─────────────────────────────────────────────────────────
    if (sub === 'disable') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can do this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await ctx.storage.delete('config', guildId);
      await interaction.reply({ content: 'Rust integration disabled.', flags: MessageFlags.Ephemeral });
      return;
    }

    // All other subcommands require config
    const cfg = await getConfig(ctx, guildId);
    if (!cfg) {
      await interaction.reply({
        content: 'Rust is not configured. An admin must run `/rust setup` first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isStaff(interaction, cfg)) {
      await interaction.reply({
        content: 'You do not have permission to use Rust commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ephemeral = sub !== 'status' && sub !== 'players';
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    try {
      // ── /rust status ──────────────────────────────────────────────────────
      if (sub === 'status') {
        const response = await sendRustRcon(cfg.host, cfg.port, cfg.password, 'status');

        const embed = new EmbedBuilder()
          .setTitle('Rust Server Status')
          .setColor(0x00c853)
          .setDescription(response.slice(0, 4000) || 'Server is online.')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /rust players ─────────────────────────────────────────────────────
      if (sub === 'players') {
        const response = await sendRustRcon(cfg.host, cfg.port, cfg.password, 'playerlist');
        const players = parsePlayerList(response);

        if (players.length === 0) {
          await interaction.editReply('No players currently online.');
          return;
        }

        const list = players
          .slice(0, 40)
          .map((p, i) => `\`${String(i + 1).padStart(2)}.\` **${p.Username}** — \`${p.SteamID}\`${p.Ping != null ? ` — ${p.Ping}ms` : ''}`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`Online Players — ${players.length}`)
          .setDescription(list + (players.length > 40 ? `\n_…and ${players.length - 40} more_` : ''))
          .setColor(0x1565c0)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /rust kick ────────────────────────────────────────────────────────
      if (sub === 'kick') {
        const player = interaction.options.getString('player', true);
        const reason = interaction.options.getString('reason') ?? 'Kicked by staff';
        await sendRustRcon(cfg.host, cfg.port, cfg.password, `kick ${player} ${reason}`);
        await interaction.editReply(`Player \`${player}\` kicked. Reason: ${reason}`);
        return;
      }

      // ── /rust broadcast ───────────────────────────────────────────────────
      if (sub === 'broadcast') {
        const message = interaction.options.getString('message', true);
        await sendRustRcon(cfg.host, cfg.port, cfg.password, `say ${message}`);
        await interaction.editReply('Broadcast sent.');
        return;
      }

      // ── Admin-only below ───────────────────────────────────────────────────
      if (!isAdmin(interaction, cfg)) {
        await interaction.editReply('You need an admin role to use this command.');
        return;
      }

      if (sub === 'ban') {
        const player = interaction.options.getString('player', true);
        const reason = interaction.options.getString('reason') ?? 'Banned by staff';
        await sendRustRcon(cfg.host, cfg.port, cfg.password, `ban ${player} ${reason}`);
        await interaction.editReply(`Player \`${player}\` banned. Reason: ${reason}`);
        return;
      }

      if (sub === 'unban') {
        const player = interaction.options.getString('player', true);
        await sendRustRcon(cfg.host, cfg.port, cfg.password, `unban ${player}`);
        await interaction.editReply(`Player \`${player}\` unbanned.`);
        return;
      }

      if (sub === 'give') {
        const steamId = interaction.options.getString('steamid', true);
        const item    = interaction.options.getString('item', true);
        const amount  = interaction.options.getInteger('amount') ?? 1;
        await sendRustRcon(cfg.host, cfg.port, cfg.password, `inventory.giveto ${steamId} ${item} ${amount}`);
        await interaction.editReply(`Gave ${amount}x \`${item}\` to \`${steamId}\`.`);
        return;
      }

      if (sub === 'rcon') {
        const rawCommand = interaction.options.getString('command', true);
        const result = await sendRustRcon(cfg.host, cfg.port, cfg.password, rawCommand);
        await interaction.editReply(
          result
            ? `**Result:**\n\`\`\`\n${result.slice(0, 1800)}\n\`\`\``
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
