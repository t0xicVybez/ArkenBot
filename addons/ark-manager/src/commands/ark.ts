/**
 * Implements the `/ark` slash command for managing an ARK: Survival Evolved
 * server via RCON. Staff commands require a configured staff or admin role;
 * admin commands require an admin role or the Discord Administrator permission.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonCommandDefinition, AddonContext } from '@arkenbot/addon-sdk';
import { sendRcon } from '../utils/rcon.js';

// ─── Config type ──────────────────────────────────────────────────────────────

/** Stored RCON connection details and role-based access lists for a guild. */
export interface ArkConfig {
  host: string;
  port: number;
  password: string;
  staffRoles: string[];
  adminRoles: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig(ctx: AddonContext, guildId: string): Promise<ArkConfig | null> {
  return ctx.storage.get<ArkConfig>('config', guildId);
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
  cfg: ArkConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, [...cfg.staffRoles, ...cfg.adminRoles]);
}

function isAdmin(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  cfg: ArkConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, cfg.adminRoles);
}

/**
 * Parses the ARK `listplayers` RCON response into a structured array.
 * Each connected player appears on its own line as `N. PlayerName, SteamID64`.
 * Returns an empty array when the server reports "No Players Connected".
 */
function parseListPlayers(response: string): { name: string; steamId: string }[] {
  if (!response || response.includes('No Players Connected')) return [];
  const players: { name: string; steamId: string }[] = [];
  for (const line of response.split('\n')) {
    const match = line.match(/^\d+\.\s+(.+),\s+(\d+)/);
    if (match) {
      players.push({ name: (match[1] ?? '').trim(), steamId: (match[2] ?? '').trim() });
    }
  }
  return players;
}

// ─── Command definition ───────────────────────────────────────────────────────

const command: AddonCommandDefinition = {
  data: (new SlashCommandBuilder()
    .setName('ark')
    .setDescription('ARK: Survival Evolved server management')

    // ── Config ───────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Configure ARK server connection (admin only)')
        .addStringOption((o) =>
          o.setName('host').setDescription('Server IP or hostname').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('password').setDescription('RCON password').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('port').setDescription('RCON port (default: 27020)').setRequired(false).setMinValue(1).setMaxValue(65535),
        )
        .addRoleOption((o) =>
          o.setName('staff_role').setDescription('Role allowed to use staff commands').setRequired(false),
        )
        .addRoleOption((o) =>
          o.setName('admin_role').setDescription('Role allowed to use admin commands').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s.setName('disable').setDescription('Disable the ARK integration for this server (admin only)'),
    )

    // ── Info ─────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('status').setDescription('Show ARK server status and player count'),
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
          o.setName('steamid').setDescription('Player Steam64 ID').setRequired(true),
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
          o.setName('steamid').setDescription('Player Steam64 ID').setRequired(true),
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
          o.setName('steamid').setDescription('Player Steam64 ID').setRequired(true),
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
      s.setName('save').setDescription('Save the world (admin only)'),
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

    // ── /ark setup ────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can configure this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const host      = interaction.options.getString('host', true);
      const port      = interaction.options.getInteger('port') ?? 27020;
      const password  = interaction.options.getString('password', true);
      const staffRole = interaction.options.getRole('staff_role');
      const adminRole = interaction.options.getRole('admin_role');

      const existing = await getConfig(ctx, guildId);

      // Merge roles into existing arrays so repeated calls add rather than replace.
      const staffRoles = existing?.staffRoles ? [...existing.staffRoles] : [];
      const adminRoles = existing?.adminRoles ? [...existing.adminRoles] : [];

      if (staffRole && !staffRoles.includes(staffRole.id)) staffRoles.push(staffRole.id);
      if (adminRole && !adminRoles.includes(adminRole.id)) adminRoles.push(adminRole.id);

      const cfg: ArkConfig = { host, port, password, staffRoles, adminRoles };
      await ctx.storage.set('config', cfg, guildId);

      const lines = [
        'ARK integration configured.',
        `**Host:** \`${host}:${port}\``,
        `**RCON password:** set`,
        `**Staff roles:** ${staffRoles.length ? staffRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
        `**Admin roles:** ${adminRoles.length ? adminRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
      ];

      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── /ark disable ──────────────────────────────────────────────────────────
    if (sub === 'disable') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can do this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await ctx.storage.delete('config', guildId);
      await interaction.reply({ content: 'ARK integration disabled.', flags: MessageFlags.Ephemeral });
      return;
    }

    // All remaining subcommands require a saved config.
    const cfg = await getConfig(ctx, guildId);
    if (!cfg) {
      await interaction.reply({
        content: 'ARK is not configured. An admin must run `/ark setup` first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isStaff(interaction, cfg)) {
      await interaction.reply({
        content: 'You do not have permission to use ARK commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // status and players are public; everything else is ephemeral.
    const ephemeral = sub !== 'status' && sub !== 'players';
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    try {
      // ── /ark status ───────────────────────────────────────────────────────
      if (sub === 'status') {
        const response = await sendRcon(cfg.host, cfg.port, cfg.password, 'listplayers');
        const players = parseListPlayers(response);

        const embed = new EmbedBuilder()
          .setTitle('ARK Server Status')
          .setColor(0x00c853)
          .addFields(
            { name: 'Players Online', value: String(players.length), inline: true },
            { name: 'Status', value: 'Online', inline: true },
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /ark players ──────────────────────────────────────────────────────
      if (sub === 'players') {
        const response = await sendRcon(cfg.host, cfg.port, cfg.password, 'listplayers');
        const players = parseListPlayers(response);

        if (players.length === 0) {
          await interaction.editReply('No players currently online.');
          return;
        }

        const list = players
          .slice(0, 40)
          .map((p, i) => `\`${String(i + 1).padStart(2)}.\` **${p.name}** — \`${p.steamId}\``)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`Online Players — ${players.length}`)
          .setDescription(list + (players.length > 40 ? `\n_…and ${players.length - 40} more_` : ''))
          .setColor(0x1565c0)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /ark kick ─────────────────────────────────────────────────────────
      if (sub === 'kick') {
        const steamId = interaction.options.getString('steamid', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `kickplayer ${steamId}`);
        await interaction.editReply(`Player \`${steamId}\` kicked.`);
        return;
      }

      // ── /ark broadcast ────────────────────────────────────────────────────
      if (sub === 'broadcast') {
        const message = interaction.options.getString('message', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `broadcast ${message}`);
        await interaction.editReply('Broadcast sent.');
        return;
      }

      // ── Admin-only subcommands ─────────────────────────────────────────────
      if (!isAdmin(interaction, cfg)) {
        await interaction.editReply('You need an admin role to use this command.');
        return;
      }

      if (sub === 'ban') {
        const steamId = interaction.options.getString('steamid', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `banplayer ${steamId}`);
        await interaction.editReply(`Player \`${steamId}\` banned.`);
        return;
      }

      if (sub === 'unban') {
        const steamId = interaction.options.getString('steamid', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `unbanplayer ${steamId}`);
        await interaction.editReply(`Player \`${steamId}\` unbanned.`);
        return;
      }

      if (sub === 'save') {
        await sendRcon(cfg.host, cfg.port, cfg.password, 'saveworld');
        await interaction.editReply('World saved.');
        return;
      }

      if (sub === 'rcon') {
        const rawCommand = interaction.options.getString('command', true);
        const result = await sendRcon(cfg.host, cfg.port, cfg.password, rawCommand);
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
