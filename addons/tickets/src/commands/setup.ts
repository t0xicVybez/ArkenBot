import {
  MessageFlags,
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
  type TextChannel,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import type { TicketPanel, GuildTicketConfig, SlaLevel } from '../types.js';
import {
  getPanels,
  getPanel,
  savePanel,
  deletePanel,
  getConfig,
  saveConfig,
} from '../utils/storage.js';
import { buildPanelEmbed, buildPanelButtons } from '../utils/embeds.js';

const CLOSE_ACTION_CHOICES = [
  { name: 'Delete channel', value: 'delete' },
  { name: 'Archive channel', value: 'archive' },
] as const;

const BUTTON_COLOR_CHOICES = [
  { name: 'Blurple (Primary)', value: 'primary' },
  { name: 'Grey (Secondary)', value: 'secondary' },
  { name: 'Green (Success)', value: 'success' },
  { name: 'Red (Danger)', value: 'danger' },
] as const;

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Manage ticket panels and configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // ── Panel subcommands ──
    .addSubcommandGroup((g) =>
      g
        .setName('panel')
        .setDescription('Manage ticket panels')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('Create a new ticket panel')
            .addStringOption((o) =>
              o.setName('name').setDescription('Panel name').setRequired(true).setMaxLength(50),
            )
            .addStringOption((o) =>
              o
                .setName('description')
                .setDescription('Panel description shown in the embed')
                .setRequired(true)
                .setMaxLength(1024),
            )
            .addStringOption((o) =>
              o
                .setName('emoji')
                .setDescription('Button emoji (e.g. 🎫)')
                .setRequired(false),
            )
            .addStringOption((o) =>
              o
                .setName('button_label')
                .setDescription('Button label text')
                .setRequired(false)
                .setMaxLength(80),
            )
            .addStringOption((o) =>
              o
                .setName('button_color')
                .setDescription('Button color')
                .setRequired(false)
                .addChoices(...BUTTON_COLOR_CHOICES),
            )
            .addChannelOption((o) =>
              o
                .setName('category')
                .setDescription('Category to create ticket channels in')
                .setRequired(false),
            )
            .addChannelOption((o) =>
              o.setName('log_channel').setDescription('Channel to post transcripts').setRequired(false),
            )
            .addRoleOption((o) =>
              o.setName('staff_role').setDescription('Role that can manage tickets').setRequired(false),
            )
            .addIntegerOption((o) =>
              o
                .setName('max_tickets')
                .setDescription('Max open tickets per user (default: 1)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false),
            )
            .addStringOption((o) =>
              o
                .setName('naming_pattern')
                .setDescription('Channel naming pattern ({number}, {username}) — default: ticket-{number}')
                .setRequired(false),
            )
            .addStringOption((o) =>
              o
                .setName('close_action')
                .setDescription('What to do when a ticket is closed')
                .setRequired(false)
                .addChoices(...CLOSE_ACTION_CHOICES),
            )
            .addIntegerOption((o) =>
              o
                .setName('auto_close_hours')
                .setDescription('Auto-close inactive tickets after N hours (0 = off, default: 48)')
                .setMinValue(0)
                .setMaxValue(720)
                .setRequired(false),
            )
            .addBooleanOption((o) =>
              o
                .setName('require_reason')
                .setDescription('Ask the user for a reason before opening (default: false)')
                .setRequired(false),
            )
            .addStringOption((o) =>
              o
                .setName('welcome_message')
                .setDescription(
                  'Message inside the ticket. Placeholders: {user}, {username}, {number}',
                )
                .setRequired(false)
                .setMaxLength(1024),
            )
            .addStringOption((o) =>
              o
                .setName('ticket_mode')
                .setDescription('How tickets are created (default: channel)')
                .setRequired(false)
                .addChoices(
                  { name: 'Channel (default)', value: 'channel' },
                  { name: 'Thread', value: 'thread' },
                ),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('send')
            .setDescription('Send a panel message to a channel')
            .addStringOption((o) =>
              o.setName('panel').setDescription('Panel name').setRequired(true).setAutocomplete(true),
            )
            .addChannelOption((o) =>
              o.setName('channel').setDescription('Channel to send the panel in').setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('list')
            .setDescription('List all ticket panels in this server'),
        )
        .addSubcommand((s) =>
          s
            .setName('delete')
            .setDescription('Delete a ticket panel')
            .addStringOption((o) =>
              o.setName('panel').setDescription('Panel name').setRequired(true).setAutocomplete(true),
            ),
        ),
    )
    // ── Config subcommands ──
    .addSubcommandGroup((g) =>
      g
        .setName('config')
        .setDescription('Global ticket configuration')
        .addSubcommand((s) =>
          s
            .setName('transcript_channel')
            .setDescription('Set the default channel for transcripts')
            .addChannelOption((o) =>
              o.setName('channel').setDescription('Transcript channel').setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('blacklist')
            .setDescription('Add or remove a user from the ticket blacklist')
            .addStringOption((o) =>
              o
                .setName('action')
                .setDescription('Add or remove')
                .setRequired(true)
                .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }),
            )
            .addUserOption((o) =>
              o.setName('user').setDescription('User to blacklist').setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('settings')
            .setDescription('Configure global ticket settings')
            .addChannelOption((o) =>
              o.setName('staff_notify_channel').setDescription('Channel to ping when a new ticket opens').setRequired(false),
            )
            .addRoleOption((o) =>
              o.setName('staff_notify_role').setDescription('Role to ping in the notification channel').setRequired(false),
            )
            .addIntegerOption((o) =>
              o
                .setName('rating_window')
                .setDescription('Minutes before ticket deletion (default: 5, max: 1440)')
                .setMinValue(1)
                .setMaxValue(1440)
                .setRequired(false),
            )
            .addBooleanOption((o) =>
              o.setName('auto_assign').setDescription('Round-robin auto-assign new tickets to staff').setRequired(false),
            ),
        ),
    )
    // ── SLA subcommands ──
    .addSubcommandGroup((g) =>
      g
        .setName('sla')
        .setDescription('Manage SLA escalation levels')
        .addSubcommand((s) =>
          s
            .setName('add-level')
            .setDescription('Add an SLA escalation level')
            .addIntegerOption((o) =>
              o.setName('hours').setDescription('Hours before escalation').setMinValue(1).setRequired(true),
            )
            .addRoleOption((o) =>
              o.setName('ping_role').setDescription('Role to ping at this level').setRequired(false),
            )
            .addStringOption((o) =>
              o.setName('message').setDescription('Custom message to send').setRequired(false).setMaxLength(500),
            ),
        )
        .addSubcommand((s) =>
          s.setName('list-levels').setDescription('List all configured SLA escalation levels'),
        )
        .addSubcommand((s) =>
          s
            .setName('remove-level')
            .setDescription('Remove an SLA escalation level')
            .addIntegerOption((o) =>
              o.setName('hours').setDescription('Hours of the level to remove').setMinValue(1).setRequired(true),
            ),
        ),
    ) as unknown as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext) {
    if (!interaction.guildId) return;
    const focused = interaction.options.getFocused();
    const panels = await getPanels(ctx.storage, interaction.guildId);
    const choices = panels
      .filter((p) => p.name.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((p) => ({ name: p.name, value: p.id }));
    await interaction.respond(choices);
  },

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === 'panel') {
      if (sub === 'create') await handlePanelCreate(interaction, ctx);
      else if (sub === 'send') await handlePanelSend(interaction, ctx);
      else if (sub === 'list') await handlePanelList(interaction, ctx);
      else if (sub === 'delete') await handlePanelDelete(interaction, ctx);
    } else if (group === 'config') {
      if (sub === 'transcript_channel') await handleConfigTranscript(interaction, ctx);
      else if (sub === 'blacklist') await handleConfigBlacklist(interaction, ctx);
      else if (sub === 'settings') await handleConfigSettings(interaction, ctx);
    } else if (group === 'sla') {
      if (sub === 'add-level') await handleSlaAddLevel(interaction, ctx);
      else if (sub === 'list-levels') await handleSlaListLevels(interaction, ctx);
      else if (sub === 'remove-level') await handleSlaRemoveLevel(interaction, ctx);
    }
  },
};

export default command;

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handlePanelCreate(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;

  const name = interaction.options.getString('name', true);
  const description = interaction.options.getString('description', true);

  // Check for duplicate name
  const panels = await getPanels(ctx.storage, guildId);
  if (panels.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    await interaction.reply({
      content: `❌ A panel named **${name}** already exists.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const category = interaction.options.getChannel('category');
  const logChannel = interaction.options.getChannel('log_channel');
  const staffRole = interaction.options.getRole('staff_role');

  const panel: TicketPanel = {
    id: randomUUID(),
    name,
    description,
    emoji: interaction.options.getString('emoji') ?? '🎫',
    buttonLabel: interaction.options.getString('button_label') ?? 'Open a Ticket',
    buttonColor: (interaction.options.getString('button_color') ?? 'primary') as TicketPanel['buttonColor'],
    categoryId: category?.id,
    logChannelId: logChannel?.id,
    staffRoles: staffRole ? [staffRole.id] : [],
    maxTicketsPerUser: interaction.options.getInteger('max_tickets') ?? 1,
    namingPattern: interaction.options.getString('naming_pattern') ?? 'ticket-{number}',
    closeAction: (interaction.options.getString('close_action') ?? 'delete') as TicketPanel['closeAction'],
    autoCloseHours: interaction.options.getInteger('auto_close_hours') ?? 48,
    requireReason: interaction.options.getBoolean('require_reason') ?? false,
    welcomeMessage:
      interaction.options.getString('welcome_message') ??
      'Welcome {user}! A staff member will be with you shortly.\nPlease describe your issue below.',
    ticketMode: (interaction.options.getString('ticket_mode') ?? 'channel') as 'channel' | 'thread',
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  await savePanel(ctx.storage, guildId, panel);

  await interaction.reply({
    content: `✅ Panel **${name}** created (ID: \`${panel.id}\`).\nUse \`/ticket-setup panel send\` to post it in a channel.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePanelSend(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const panelId = interaction.options.getString('panel', true);
  const targetChannel = interaction.options.getChannel('channel', true);

  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel) {
    await interaction.reply({ content: '❌ Panel not found.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.guild!.channels.cache.get(targetChannel.id) as TextChannel | undefined;
  if (!channel?.isTextBased()) {
    await interaction.reply({ content: '❌ Invalid channel.', flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = buildPanelEmbed(panel, interaction.guild!);
  const rows = buildPanelButtons(panel);

  const msg = await channel.send({ embeds: [embed], components: rows });

  // Store channel/message reference on the panel
  panel.channelId = channel.id;
  panel.messageId = msg.id;
  await savePanel(ctx.storage, guildId, panel);

  await interaction.reply({
    content: `✅ Panel **${panel.name}** sent in ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePanelList(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const panels = await getPanels(ctx.storage, interaction.guildId!);

  if (panels.length === 0) {
    await interaction.reply({
      content: '📭 No panels configured. Use `/ticket-setup panel create` to create one.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = panels.map(
    (p) =>
      `**${p.name}** \`${p.id}\` — ${p.enabled ? '✅ Enabled' : '❌ Disabled'} | Close: ${p.closeAction} | Auto-close: ${p.autoCloseHours > 0 ? `${p.autoCloseHours}h` : 'off'}`,
  );

  await interaction.reply({
    content: `**Ticket Panels (${panels.length})**\n${lines.join('\n')}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePanelDelete(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const panelId = interaction.options.getString('panel', true);

  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel) {
    await interaction.reply({ content: '❌ Panel not found.', flags: MessageFlags.Ephemeral });
    return;
  }

  await deletePanel(ctx.storage, guildId, panelId);
  await interaction.reply({
    content: `✅ Panel **${panel.name}** deleted.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigTranscript(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const channel = interaction.options.getChannel('channel', true);

  const config = await getConfig(ctx.storage, guildId);
  config.transcriptChannelId = channel.id;
  await saveConfig(ctx.storage, guildId, config);

  await interaction.reply({
    content: `✅ Transcript channel set to ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigBlacklist(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const action = interaction.options.getString('action', true) as 'add' | 'remove';
  const user = interaction.options.getUser('user', true);

  const config = await getConfig(ctx.storage, guildId);

  if (action === 'add') {
    if (!config.blacklistedUsers.includes(user.id)) {
      config.blacklistedUsers.push(user.id);
    }
    await saveConfig(ctx.storage, guildId, config);
    await interaction.reply({
      content: `✅ **${user.tag}** has been blacklisted from opening tickets.`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    config.blacklistedUsers = config.blacklistedUsers.filter((id) => id !== user.id);
    await saveConfig(ctx.storage, guildId, config);
    await interaction.reply({
      content: `✅ **${user.tag}** has been removed from the blacklist.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleConfigSettings(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const config = await getConfig(ctx.storage, guildId);

  const notifyChannel = interaction.options.getChannel('staff_notify_channel');
  const notifyRole = interaction.options.getRole('staff_notify_role');
  const ratingWindow = interaction.options.getInteger('rating_window');
  const autoAssign = interaction.options.getBoolean('auto_assign');

  if (notifyChannel !== null) config.staffNotifyChannelId = notifyChannel.id;
  if (notifyRole !== null) config.staffNotifyRoleId = notifyRole.id;
  if (ratingWindow !== null) config.ratingWindowMinutes = ratingWindow;
  if (autoAssign !== null) config.autoAssign = autoAssign;

  await saveConfig(ctx.storage, guildId, config);

  const lines: string[] = ['✅ Settings updated:'];
  if (notifyChannel !== null) lines.push(`• Staff notify channel: ${notifyChannel}`);
  if (notifyRole !== null) lines.push(`• Staff notify role: ${notifyRole}`);
  if (ratingWindow !== null) lines.push(`• Rating window: ${ratingWindow} minutes`);
  if (autoAssign !== null) lines.push(`• Auto-assign: ${autoAssign ? 'enabled' : 'disabled'}`);

  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

async function handleSlaAddLevel(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const hours = interaction.options.getInteger('hours', true);
  const pingRole = interaction.options.getRole('ping_role');
  const message = interaction.options.getString('message');

  const config = await getConfig(ctx.storage, guildId);
  if (!config.slaLevels) config.slaLevels = [];

  if (config.slaLevels.some((l) => l.hours === hours)) {
    await interaction.reply({ content: `❌ An SLA level for **${hours}h** already exists. Remove it first.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const level: SlaLevel = { hours };
  if (pingRole) level.pingRoleId = pingRole.id;
  if (message) level.message = message;
  config.slaLevels.push(level);
  config.slaLevels.sort((a, b) => a.hours - b.hours);

  await saveConfig(ctx.storage, guildId, config);
  await interaction.reply({
    content: `✅ SLA level added: **${hours}h**${pingRole ? ` → pings ${pingRole}` : ''}${message ? `\n> ${message}` : ''}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSlaListLevels(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const config = await getConfig(ctx.storage, guildId);

  if (!config.slaLevels || config.slaLevels.length === 0) {
    await interaction.reply({ content: '📭 No SLA levels configured.', flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = config.slaLevels.map(
    (l) => `• **${l.hours}h**${l.pingRoleId ? ` — pings <@&${l.pingRoleId}>` : ''}${l.message ? `\n  > ${l.message}` : ''}`,
  );
  await interaction.reply({ content: `**SLA Escalation Levels**\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
}

async function handleSlaRemoveLevel(
  interaction: ChatInputCommandInteraction,
  ctx: AddonContext,
): Promise<void> {
  const guildId = interaction.guildId!;
  const hours = interaction.options.getInteger('hours', true);

  const config = await getConfig(ctx.storage, guildId);
  if (!config.slaLevels?.some((l) => l.hours === hours)) {
    await interaction.reply({ content: `❌ No SLA level found for **${hours}h**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  config.slaLevels = config.slaLevels.filter((l) => l.hours !== hours);
  await saveConfig(ctx.storage, guildId, config);
  await interaction.reply({ content: `✅ SLA level **${hours}h** removed.`, flags: MessageFlags.Ephemeral });
}
