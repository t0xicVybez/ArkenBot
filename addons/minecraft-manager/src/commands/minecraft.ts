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

export interface MinecraftConfig {
  host: string;
  port: number;
  password: string;
  staffRoles: string[];
  adminRoles: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig(ctx: AddonContext, guildId: string): Promise<MinecraftConfig | null> {
  return ctx.storage.get<MinecraftConfig>('config', guildId);
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
  cfg: MinecraftConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, [...cfg.staffRoles, ...cfg.adminRoles]);
}

function isAdmin(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  cfg: MinecraftConfig,
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction, cfg.adminRoles);
}

/** Parse Minecraft's `list` response: "There are X of a max of Y players online: ..." */
function parseListResponse(response: string): { online: number; max: number; names: string[] } {
  const match = response.match(/There are (\d+) of a max(?: of)? (\d+) players online[.:](.*)/i);
  if (!match) return { online: 0, max: 0, names: [] };
  const online = parseInt(match[1] ?? '0', 10);
  const max    = parseInt(match[2] ?? '0', 10);
  const names  = (match[3] ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  return { online, max, names };
}

// ─── Command definition ───────────────────────────────────────────────────────

const command: AddonCommandDefinition = {
  data: (new SlashCommandBuilder()
    .setName('minecraft')
    .setDescription('Minecraft server management')

    // ── Config ───────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Configure Minecraft server connection (admin only)')
        .addStringOption((o) =>
          o.setName('host').setDescription('Server IP or hostname').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('password').setDescription('RCON password').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('port').setDescription('RCON port (default: 25575)').setRequired(false).setMinValue(1).setMaxValue(65535),
        )
        .addRoleOption((o) =>
          o.setName('staff_role').setDescription('Role allowed to use staff commands').setRequired(false),
        )
        .addRoleOption((o) =>
          o.setName('admin_role').setDescription('Role allowed to use admin commands').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s.setName('disable').setDescription('Disable the Minecraft integration for this server (admin only)'),
    )

    // ── Info ─────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName('status').setDescription('Show Minecraft server status and player count'),
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
          o.setName('id').setDescription('Player name').setRequired(true),
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
          o.setName('player').setDescription('Player name').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Ban reason').setRequired(false),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('unban')
        .setDescription('Unban (pardon) a player (admin only)')
        .addStringOption((o) =>
          o.setName('player').setDescription('Player name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('whitelist')
        .setDescription('Add or remove a player from the whitelist (admin only)')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
            ),
        )
        .addStringOption((o) =>
          o.setName('player').setDescription('Player name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('op')
        .setDescription('Grant operator status to a player (admin only)')
        .addStringOption((o) =>
          o.setName('player').setDescription('Player name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('deop')
        .setDescription('Revoke operator status from a player (admin only)')
        .addStringOption((o) =>
          o.setName('player').setDescription('Player name').setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('give')
        .setDescription('Give an item to a player (admin only)')
        .addStringOption((o) =>
          o.setName('player').setDescription('Player name').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('item').setDescription('Item ID, e.g. minecraft:diamond').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Amount (default: 1)').setRequired(false).setMinValue(1),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('gamemode')
        .setDescription("Change a player's game mode (admin only)")
        .addStringOption((o) =>
          o.setName('player').setDescription('Player name').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('Game mode')
            .setRequired(true)
            .addChoices(
              { name: 'Survival', value: 'survival' },
              { name: 'Creative', value: 'creative' },
              { name: 'Adventure', value: 'adventure' },
              { name: 'Spectator', value: 'spectator' },
            ),
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

    // ── /minecraft setup ──────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can configure this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const host      = interaction.options.getString('host', true);
      const port      = interaction.options.getInteger('port') ?? 25575;
      const password  = interaction.options.getString('password', true);
      const staffRole = interaction.options.getRole('staff_role');
      const adminRole = interaction.options.getRole('admin_role');

      const existing = await getConfig(ctx, guildId);

      const staffRoles = existing?.staffRoles ? [...existing.staffRoles] : [];
      const adminRoles = existing?.adminRoles ? [...existing.adminRoles] : [];

      if (staffRole && !staffRoles.includes(staffRole.id)) staffRoles.push(staffRole.id);
      if (adminRole && !adminRoles.includes(adminRole.id)) adminRoles.push(adminRole.id);

      const cfg: MinecraftConfig = { host, port, password, staffRoles, adminRoles };
      await ctx.storage.set('config', cfg, guildId);

      const lines = [
        'Minecraft integration configured.',
        `**Host:** \`${host}:${port}\``,
        `**RCON password:** set`,
        `**Staff roles:** ${staffRoles.length ? staffRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
        `**Admin roles:** ${adminRoles.length ? adminRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
      ];

      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── /minecraft disable ────────────────────────────────────────────────────
    if (sub === 'disable') {
      if (!isGuildAdmin) {
        await interaction.reply({
          content: 'Only server administrators can do this.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await ctx.storage.delete('config', guildId);
      await interaction.reply({ content: 'Minecraft integration disabled.', flags: MessageFlags.Ephemeral });
      return;
    }

    // All other subcommands require config
    const cfg = await getConfig(ctx, guildId);
    if (!cfg) {
      await interaction.reply({
        content: 'Minecraft is not configured. An admin must run `/minecraft setup` first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isStaff(interaction, cfg)) {
      await interaction.reply({
        content: 'You do not have permission to use Minecraft commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ephemeral = sub !== 'status' && sub !== 'players';
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    try {
      // ── /minecraft status ─────────────────────────────────────────────────
      if (sub === 'status') {
        const response = await sendRcon(cfg.host, cfg.port, cfg.password, 'list');
        const { online, max, names } = parseListResponse(response);

        const embed = new EmbedBuilder()
          .setTitle('Minecraft Server Status')
          .setColor(0x00c853)
          .addFields(
            { name: 'Players Online', value: `${online} / ${max}`, inline: true },
            { name: 'Status', value: 'Online', inline: true },
          )
          .setTimestamp();

        if (names.length) {
          embed.addFields({ name: 'Players', value: names.join(', '), inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /minecraft players ────────────────────────────────────────────────
      if (sub === 'players') {
        const response = await sendRcon(cfg.host, cfg.port, cfg.password, 'list');
        const { online, max, names } = parseListResponse(response);

        if (online === 0) {
          await interaction.editReply('No players currently online.');
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`Online Players — ${online} / ${max}`)
          .setDescription(names.map((n) => `• ${n}`).join('\n') || 'None')
          .setColor(0x1565c0)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ── /minecraft kick ───────────────────────────────────────────────────
      if (sub === 'kick') {
        const player = interaction.options.getString('id', true);
        const reason = interaction.options.getString('reason') ?? 'Kicked by staff';
        await sendRcon(cfg.host, cfg.port, cfg.password, `kick ${player} ${reason}`);
        await interaction.editReply(`Player \`${player}\` kicked. Reason: ${reason}`);
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
        await sendRcon(cfg.host, cfg.port, cfg.password, `ban ${player} ${reason}`);
        await interaction.editReply(`Player \`${player}\` banned. Reason: ${reason}`);
        return;
      }

      if (sub === 'unban') {
        const player = interaction.options.getString('player', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `pardon ${player}`);
        await interaction.editReply(`Player \`${player}\` unbanned.`);
        return;
      }

      if (sub === 'whitelist') {
        const action = interaction.options.getString('action', true);
        const player = interaction.options.getString('player', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `whitelist ${action} ${player}`);
        await interaction.editReply(`Player \`${player}\` ${action === 'add' ? 'added to' : 'removed from'} the whitelist.`);
        return;
      }

      if (sub === 'op') {
        const player = interaction.options.getString('player', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `op ${player}`);
        await interaction.editReply(`Granted operator status to \`${player}\`.`);
        return;
      }

      if (sub === 'deop') {
        const player = interaction.options.getString('player', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `deop ${player}`);
        await interaction.editReply(`Revoked operator status from \`${player}\`.`);
        return;
      }

      if (sub === 'give') {
        const player = interaction.options.getString('player', true);
        const item   = interaction.options.getString('item', true);
        const amount = interaction.options.getInteger('amount') ?? 1;
        await sendRcon(cfg.host, cfg.port, cfg.password, `give ${player} ${item} ${amount}`);
        await interaction.editReply(`Gave ${amount}x \`${item}\` to \`${player}\`.`);
        return;
      }

      if (sub === 'gamemode') {
        const player = interaction.options.getString('player', true);
        const mode   = interaction.options.getString('mode', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `gamemode ${mode} ${player}`);
        await interaction.editReply(`Set \`${player}\`'s game mode to \`${mode}\`.`);
        return;
      }

      if (sub === 'broadcast') {
        const message = interaction.options.getString('message', true);
        await sendRcon(cfg.host, cfg.port, cfg.password, `say ${message}`);
        await interaction.editReply('Broadcast sent.');
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
