/**
 * Implements the `/fivem` slash command for managing a FiveM server via
 * the ArkenBot FiveM resource HTTP API. Supports QBCore and ESX frameworks.
 * Staff commands require a configured staff or admin role;
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
import type { FivemConfig, FivemPlayer, FivemPlayerInfo, FivemStatus } from '../types.js';
import { callServer } from '../utils/api.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig(ctx: AddonContext, guildId: string): Promise<FivemConfig | null> {
  return ctx.storage.get<FivemConfig>('config', guildId);
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
  cfg: FivemConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, [...cfg.staffRoles, ...cfg.adminRoles]);
}

function isAdmin(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  cfg: FivemConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, cfg.adminRoles);
}

// ─── Command definition ───────────────────────────────────────────────────────

const command: AddonCommandDefinition = {
  data: (new SlashCommandBuilder()
    .setName('fivem')
    .setDescription('FiveM server management')

    // ── Config ──────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Configure FiveM server connection (admin only)')
        .addStringOption((o) =>
          o
            .setName('url')
            .setDescription('Server URL, e.g. http://45.12.34.56:30120')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('token')
            .setDescription('API token — must match arkenbot_token convar in server.cfg')
            .setRequired(true),
        )
        .addRoleOption((o) =>
          o
            .setName('staff_role')
            .setDescription('Role allowed to use staff commands')
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o
            .setName('admin_role')
            .setDescription('Role allowed to use admin commands')
            .setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s.setName('disable').setDescription('Disable the FiveM integration for this server (admin only)'),
    )

    // ── Info ─────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('status').setDescription('Show FiveM server status and player count'),
    )

    .addSubcommand((s) =>
      s.setName('players').setDescription('List players currently online'),
    )

    .addSubcommand((s) =>
      s
        .setName('player')
        .setDescription('Show detailed info for a specific player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        ),
    )

    // ── Moderation ───────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('kick')
        .setDescription('Kick a player from the server')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Kick reason').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('ban')
        .setDescription('Ban a player from the server')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Ban reason').setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('duration')
            .setDescription('Ban duration, e.g. "7d", "permanent"')
            .setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('announce')
        .setDescription('Send a server-wide announcement')
        .addStringOption((o) =>
          o.setName('message').setDescription('Message to announce').setRequired(true),
        ),
    )

    // ── Player Management ────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('giveitem')
        .setDescription('Give an item to a player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('item').setDescription('Item name').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('removeitem')
        .setDescription('Remove an item from a player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('item').setDescription('Item name').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('givemoney')
        .setDescription('Give money to a player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o
            .setName('account')
            .setDescription('Account type')
            .setRequired(true)
            .addChoices(
              { name: 'Cash', value: 'cash' },
              { name: 'Bank', value: 'bank' },
              { name: 'Crypto', value: 'crypto' },
            ),
        )
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('removemoney')
        .setDescription('Remove money from a player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o
            .setName('account')
            .setDescription('Account type')
            .setRequired(true)
            .addChoices(
              { name: 'Cash', value: 'cash' },
              { name: 'Bank', value: 'bank' },
              { name: 'Crypto', value: 'crypto' },
            ),
        )
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('setjob')
        .setDescription("Set a player's job")
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('job').setDescription('Job name').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('grade').setDescription('Job grade (default: 0)').setRequired(false).setMinValue(0),
        ),
    )

    // ── Server Management ────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Start a server resource')
        .addStringOption((o) =>
          o.setName('resource').setDescription('Resource name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('stop')
        .setDescription('Stop a server resource')
        .addStringOption((o) =>
          o.setName('resource').setDescription('Resource name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('restart')
        .setDescription('Restart a server resource')
        .addStringOption((o) =>
          o.setName('resource').setDescription('Resource name').setRequired(true),
        ),
    )

    // ── Staff: warn / freeze / revive / heal ─────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('warn')
        .setDescription('Send an in-game warning notification to a player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Warning reason').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('freeze')
        .setDescription('Freeze or unfreeze a player in place')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o
            .setName('state')
            .setDescription('Freeze or unfreeze')
            .setRequired(true)
            .addChoices({ name: 'Freeze', value: 'freeze' }, { name: 'Unfreeze', value: 'unfreeze' }),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('revive')
        .setDescription('Revive a downed player')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('heal')
        .setDescription('Fully heal a player (max health + full armour)')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        ),
    )

    // ── Admin: setgang / clearinventory / setcoords / resources / rcon ────────
    .addSubcommand((s) =>
      s
        .setName('setgang')
        .setDescription("Set a player's gang and grade (QBCore only)")
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addStringOption((o) =>
          o.setName('gang').setDescription('Gang name').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('grade').setDescription('Gang grade (default: 0)').setRequired(false).setMinValue(0),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('clearinventory')
        .setDescription("Clear all items from a player's inventory")
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('setcoords')
        .setDescription('Teleport a player to specific coordinates')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Player server ID').setRequired(true).setMinValue(1),
        )
        .addNumberOption((o) =>
          o.setName('x').setDescription('X coordinate').setRequired(true),
        )
        .addNumberOption((o) =>
          o.setName('y').setDescription('Y coordinate').setRequired(true),
        )
        .addNumberOption((o) =>
          o.setName('z').setDescription('Z coordinate').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s.setName('resources').setDescription('List all server resources and their state'),
    )

    .addSubcommand((s) =>
      s
        .setName('rcon')
        .setDescription('Execute a raw console command on the FiveM server (admin only)')
        .addStringOption((o) =>
          o.setName('command').setDescription('Console command to execute').setRequired(true),
        ),
    )
  ) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;

    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

    // ── /fivem setup ──────────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can configure this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const url        = interaction.options.getString('url', true).replace(/\/$/, '');
      const apiToken   = interaction.options.getString('token', true);
      const staffRole  = interaction.options.getRole('staff_role');
      const adminRole  = interaction.options.getRole('admin_role');

      const existing = await getConfig(ctx, guildId);

      // Merge roles into existing arrays so repeated calls add rather than replace.
      const staffRoles = existing?.staffRoles ? [...existing.staffRoles] : [];
      const adminRoles = existing?.adminRoles ? [...existing.adminRoles] : [];

      if (staffRole && !staffRoles.includes(staffRole.id)) {
        staffRoles.push(staffRole.id);
      }
      if (adminRole && !adminRoles.includes(adminRole.id)) {
        adminRoles.push(adminRole.id);
      }

      const cfg: FivemConfig = { serverUrl: url, apiToken, staffRoles, adminRoles };
      await ctx.storage.set('config', cfg, guildId);

      const lines = [
        'FiveM integration configured.',
        `**Server URL:** \`${url}\``,
        `**API Token:** set`,
        `**Staff roles:** ${staffRoles.length ? staffRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
        `**Admin roles:** ${adminRoles.length ? adminRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
      ];

      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── /fivem disable ────────────────────────────────────────────────────────
    if (sub === 'disable') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can do this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await ctx.storage.delete('config', guildId);
      await interaction.reply({ content: 'FiveM integration disabled.', flags: MessageFlags.Ephemeral });
      return;
    }

    // All remaining subcommands require a saved config.
    const cfg = await getConfig(ctx, guildId);
    if (!cfg) {
      await interaction.reply({
        content: 'FiveM is not configured. An admin must run `/fivem setup` first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isStaff(interaction, cfg)) {
      await interaction.reply({
        content: 'You do not have permission to use FiveM commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // status and players are public; everything else is ephemeral.
    const ephemeral = sub !== 'status' && sub !== 'players';
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    try {
      // ── /fivem status ──────────────────────────────────────────────────────
      if (sub === 'status') {
        const status = await callServer<FivemStatus>(cfg.serverUrl, cfg.apiToken, 'status');

        const frameworkLabel =
          status.framework === 'qbcore' ? 'QBCore'
          : status.framework === 'esx' ? 'ESX'
          : 'None detected';

        const embed = new EmbedBuilder()
          .setTitle('Server Status')
          .setColor(0x00c853)
          .addFields(
            { name: 'Hostname',   value: status.hostname || 'Unknown', inline: false },
            { name: 'Players',    value: `${status.playerCount} / ${status.maxPlayers}`, inline: true },
            { name: 'Framework',  value: frameworkLabel, inline: true },
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /fivem players ─────────────────────────────────────────────────────
      if (sub === 'players') {
        const players = await callServer<FivemPlayer[]>(cfg.serverUrl, cfg.apiToken, 'players');

        if (players.length === 0) {
          await interaction.editReply('No players currently online.');
          return;
        }

        const list = players
          .slice(0, 40)
          .map((p, i) => `\`${String(i + 1).padStart(2)}.\` \`${String(p.id).padStart(3)}\` **${p.name}** — ${p.ping}ms`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`Online Players — ${players.length}`)
          .setDescription(list + (players.length > 40 ? `\n_…and ${players.length - 40} more_` : ''))
          .setColor(0x1565c0)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /fivem player ──────────────────────────────────────────────────────
      if (sub === 'player') {
        const id   = interaction.options.getInteger('id', true);
        const info = await callServer<FivemPlayerInfo>(cfg.serverUrl, cfg.apiToken, 'playerinfo', { id });

        const embed = new EmbedBuilder()
          .setTitle(`Player Info — ${info.name}`)
          .setColor(0x7b1fa2)
          .addFields({ name: 'Server ID', value: String(info.id), inline: true })
          .addFields({ name: 'Ping', value: `${info.ping}ms`, inline: true });

        if (info.citizenid) embed.addFields({ name: 'Citizen ID', value: info.citizenid, inline: true });
        if (info.identifier) embed.addFields({ name: 'Identifier', value: info.identifier, inline: true });
        if (info.job != null) {
          embed.addFields({
            name: 'Job',
            value: `${info.job} (grade ${info.jobGrade ?? 0})`,
            inline: true,
          });
        }
        if (info.money) {
          const moneyParts: string[] = [];
          if (info.money.cash != null)   moneyParts.push(`Cash: $${info.money.cash}`);
          if (info.money.bank != null)   moneyParts.push(`Bank: $${info.money.bank}`);
          if (info.money.crypto != null) moneyParts.push(`Crypto: $${info.money.crypto}`);
          if (moneyParts.length) embed.addFields({ name: 'Money', value: moneyParts.join('\n'), inline: false });
        }
        if (info.identifiers.length) {
          embed.addFields({
            name: 'Identifiers',
            value: '```\n' + info.identifiers.join('\n') + '\n```',
            inline: false,
          });
        }

        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── Moderation — staff required ────────────────────────────────────────

      if (sub === 'kick') {
        const id     = interaction.options.getInteger('id', true);
        const reason = interaction.options.getString('reason') ?? 'Kicked by staff';
        await callServer(cfg.serverUrl, cfg.apiToken, 'kick', { id, reason });
        await interaction.editReply(`Player \`${id}\` kicked. Reason: ${reason}`);
        return;
      }

      if (sub === 'ban') {
        const id       = interaction.options.getInteger('id', true);
        const reason   = interaction.options.getString('reason') ?? 'Banned by staff';
        const duration = interaction.options.getString('duration') ?? 'permanent';
        const result = await callServer<{ note?: string }>(cfg.serverUrl, cfg.apiToken, 'ban', { id, reason, duration });
        let msg = `Player \`${id}\` banned. Reason: ${reason} | Duration: ${duration}`;
        if (result?.note) msg += `\n**Note:** ${result.note}`;
        await interaction.editReply(msg);
        return;
      }

      if (sub === 'announce') {
        const message = interaction.options.getString('message', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'announce', { message });
        await interaction.editReply('Announcement sent.');
        return;
      }

      if (sub === 'warn') {
        const id     = interaction.options.getInteger('id', true);
        const reason = interaction.options.getString('reason', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'warn', { id, reason });
        await interaction.editReply(`Player \`${id}\` warned: ${reason}`);
        return;
      }

      if (sub === 'freeze') {
        const id     = interaction.options.getInteger('id', true);
        const freeze = interaction.options.getString('state', true) === 'freeze';
        await callServer(cfg.serverUrl, cfg.apiToken, 'freeze', { id, freeze });
        await interaction.editReply(`Player \`${id}\` ${freeze ? 'frozen' : 'unfrozen'}.`);
        return;
      }

      if (sub === 'revive') {
        const id = interaction.options.getInteger('id', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'revive', { id });
        await interaction.editReply(`Player \`${id}\` revived.`);
        return;
      }

      if (sub === 'heal') {
        const id = interaction.options.getInteger('id', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'heal', { id });
        await interaction.editReply(`Player \`${id}\` fully healed.`);
        return;
      }

      // ── Admin-only subcommands ─────────────────────────────────────────────
      if (!isAdmin(interaction, cfg)) {
        await interaction.editReply('You need an admin role to use this command.');
        return;
      }

      if (sub === 'giveitem') {
        const id     = interaction.options.getInteger('id', true);
        const item   = interaction.options.getString('item', true);
        const amount = interaction.options.getInteger('amount', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'giveitem', { id, item, amount });
        await interaction.editReply(`Gave ${amount}x \`${item}\` to player \`${id}\`.`);
        return;
      }

      if (sub === 'removeitem') {
        const id     = interaction.options.getInteger('id', true);
        const item   = interaction.options.getString('item', true);
        const amount = interaction.options.getInteger('amount', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'removeitem', { id, item, amount });
        await interaction.editReply(`Removed ${amount}x \`${item}\` from player \`${id}\`.`);
        return;
      }

      if (sub === 'givemoney') {
        const id      = interaction.options.getInteger('id', true);
        const account = interaction.options.getString('account', true);
        const amount  = interaction.options.getInteger('amount', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'givemoney', { id, account, amount });
        await interaction.editReply(`Gave $${amount} (${account}) to player \`${id}\`.`);
        return;
      }

      if (sub === 'removemoney') {
        const id      = interaction.options.getInteger('id', true);
        const account = interaction.options.getString('account', true);
        const amount  = interaction.options.getInteger('amount', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'removemoney', { id, account, amount });
        await interaction.editReply(`Removed $${amount} (${account}) from player \`${id}\`.`);
        return;
      }

      if (sub === 'setjob') {
        const id    = interaction.options.getInteger('id', true);
        const job   = interaction.options.getString('job', true);
        const grade = interaction.options.getInteger('grade') ?? 0;
        await callServer(cfg.serverUrl, cfg.apiToken, 'setjob', { id, job, grade });
        await interaction.editReply(`Set player \`${id}\`'s job to \`${job}\` (grade ${grade}).`);
        return;
      }

      if (sub === 'setgang') {
        const id    = interaction.options.getInteger('id', true);
        const gang  = interaction.options.getString('gang', true);
        const grade = interaction.options.getInteger('grade') ?? 0;
        await callServer(cfg.serverUrl, cfg.apiToken, 'setgang', { id, gang, grade });
        await interaction.editReply(`Set player \`${id}\`'s gang to \`${gang}\` (grade ${grade}).`);
        return;
      }

      if (sub === 'clearinventory') {
        const id = interaction.options.getInteger('id', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'clearinventory', { id });
        await interaction.editReply(`Cleared inventory of player \`${id}\`.`);
        return;
      }

      if (sub === 'setcoords') {
        const id = interaction.options.getInteger('id', true);
        const x  = interaction.options.getNumber('x', true);
        const y  = interaction.options.getNumber('y', true);
        const z  = interaction.options.getNumber('z', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'setcoords', { id, x, y, z });
        await interaction.editReply(`Teleported player \`${id}\` to \`${x}, ${y}, ${z}\`.`);
        return;
      }

      if (sub === 'resources') {
        const list    = await callServer<{ name: string; state: string }[]>(cfg.serverUrl, cfg.apiToken, 'resources');
        const started = list.filter((r) => r.state === 'started');
        const stopped = list.filter((r) => r.state === 'stopped');
        const other   = list.filter((r) => r.state !== 'started' && r.state !== 'stopped');

        const fmt = (arr: { name: string; state: string }[], max = 60) => {
          const names = arr.slice(0, max).map((r) => `\`${r.name}\``).join(', ');
          return (names || 'None') + (arr.length > max ? ` _(+${arr.length - max} more)_` : '');
        };

        const embed = new EmbedBuilder()
          .setTitle(`Resources — ${list.length} total`)
          .setColor(0x37474f)
          .addFields(
            { name: `Started (${started.length})`, value: fmt(started).slice(0, 1024), inline: false },
            { name: `Stopped (${stopped.length})`, value: (fmt(stopped).slice(0, 1024)) || 'None', inline: false },
          );

        if (other.length) {
          embed.addFields({ name: 'Other', value: fmt(other).slice(0, 1024), inline: false });
        }

        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (sub === 'rcon') {
        const command = interaction.options.getString('command', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'rcon', { command });
        await interaction.editReply(`Executed: \`${command}\``);
        return;
      }

      if (sub === 'start') {
        const resource = interaction.options.getString('resource', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'startresource', { resource });
        await interaction.editReply(`Resource \`${resource}\` started.`);
        return;
      }

      if (sub === 'stop') {
        const resource = interaction.options.getString('resource', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'stopresource', { resource });
        await interaction.editReply(`Resource \`${resource}\` stopped.`);
        return;
      }

      if (sub === 'restart') {
        const resource = interaction.options.getString('resource', true);
        await callServer(cfg.serverUrl, cfg.apiToken, 'restartresource', { resource });
        await interaction.editReply(`Resource \`${resource}\` restarted.`);
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Error: ${msg}`);
    }
  },
};

export default command;
