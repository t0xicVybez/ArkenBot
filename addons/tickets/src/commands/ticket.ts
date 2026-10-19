/**
 * The /ticket command for the tickets addon.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
  type TextChannel,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { parseDuration } from '@arkenbot/shared';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import type { TicketNote } from '../types.js';
import {
  getTicketByChannel,
  saveTicket,
  getMessages,
  getPanel,
  getCannedResponses,
  getTickets,
  getUserOpenTickets,
  getPanels,
} from '../utils/storage.js';
import {
  buildInfoEmbed,
  buildTranscriptEmbed,
  buildTicketControls,
} from '../utils/embeds.js';
import { generateTranscriptHtml } from '../utils/transcript.js';
import { applyCannedVars } from '../utils/format.js';
import { isTicketStaff } from '../utils/permissions.js';
import { isReopenAllowed } from '../utils/time.js';
import {
  addUserToTicket,
  removeUserFromTicket,
  restoreTicketChannel,
} from '../utils/channel.js';
import { updateControlsMessage, sendClaimBrief, sendAssignmentBrief } from '../events/interaction.js';

const PRIORITY_CHOICES = [
  { name: '🟢 Low', value: 'low' },
  { name: '🟡 Medium', value: 'medium' },
  { name: '🟠 High', value: 'high' },
  { name: '🔴 Urgent', value: 'urgent' },
] as const;

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    .addSubcommand((s) =>
      s.setName('close').setDescription('Close this ticket').addStringOption((o) =>
        o.setName('reason').setDescription('Reason for closing').setRequired(false).setMaxLength(500),
      ),
    )
    .addSubcommand((s) => s.setName('claim').setDescription('Claim this ticket as yours'))
    .addSubcommand((s) => s.setName('unclaim').setDescription('Unclaim this ticket'))
    .addSubcommand((s) => s.setName('reopen').setDescription('Reopen a closed ticket'))
    .addSubcommand((s) =>
      s
        .setName('transfer')
        .setDescription('Transfer ownership of this ticket to another staff member')
        .addUserOption((o) => o.setName('staff').setDescription('Staff member to transfer to').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a user to this ticket')
        .addUserOption((o) => o.setName('user').setDescription('User to add').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a user from this ticket')
        .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('rename')
        .setDescription('Rename this ticket channel')
        .addStringOption((o) =>
          o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(100),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('priority')
        .setDescription('Set the priority of this ticket')
        .addStringOption((o) =>
          o
            .setName('level')
            .setDescription('Priority level')
            .setRequired(true)
            .addChoices(...PRIORITY_CHOICES),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('tag')
        .setDescription('Add or remove a tag on this ticket')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('add or remove')
            .setRequired(true)
            .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }),
        )
        .addStringOption((o) =>
          o.setName('tag').setDescription('Tag name').setRequired(true).setMaxLength(30).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('note')
        .setDescription('Add a private staff note to this ticket')
        .addStringOption((o) =>
          o.setName('text').setDescription('Note content').setRequired(true).setMaxLength(1000),
        ),
    )
    .addSubcommand((s) => s.setName('info').setDescription('Show ticket information'))
    .addSubcommand((s) => s.setName('notes').setDescription('View all staff notes on this ticket (staff only, ephemeral)'))
    .addSubcommand((s) =>
      s.setName('transcript').setDescription('Generate and send the transcript now'),
    )
    .addSubcommand((s) =>
      s
        .setName('respond')
        .setDescription('Send a canned response in this ticket')
        .addStringOption((o) =>
          o.setName('name').setDescription('Canned response name').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName('waiting').setDescription('Toggle waiting status on this ticket (staff only)'),
    )
    .addSubcommand((s) =>
      s.setName('requestclose').setDescription('Ask the ticket opener to confirm closing (staff only)'),
    )
    .addSubcommand((s) =>
      s.setName('snooze')
        .setDescription('Remind yourself about this ticket later (staff only)')
        .addStringOption((o) =>
          o.setName('in').setDescription('When to be reminded, e.g. 2h, 30m, 1d').setRequired(true).setMaxLength(20),
        ),
    )
    .addSubcommand((s) =>
      s.setName('find')
        .setDescription('Search tickets by number, user, or tag (staff only)')
        .addStringOption((o) =>
          o.setName('query').setDescription('Ticket number, username/ID, or tag').setRequired(true).setMaxLength(100),
        ),
    )
    .addSubcommand((s) =>
      s.setName('mine').setDescription('List your open tickets in this server'),
    ) as unknown as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.guildId) return;
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'tag') {

      const tickets = await getTickets(ctx.storage, interaction.guildId);
      const tagSet = new Set<string>();
      for (const t of tickets) {
        for (const tag of t.tags) tagSet.add(tag);
      }
      const query = focused.value.toLowerCase();
      const choices = [...tagSet]
        .filter((t) => t.includes(query))
        .slice(0, 25)
        .map((t) => ({ name: t, value: t }));
      await interaction.respond(choices);
      return;
    }

    if (focused.name === 'name') {

      const responses = await getCannedResponses(ctx.storage, interaction.guildId);
      const query = focused.value.toLowerCase();
      const choices = responses
        .filter((r) => r.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((r) => ({ name: r.name, value: r.name }));
      await interaction.respond(choices);
      return;
    }

    await interaction.respond([]);
  },

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    if (!interaction.guildId) {
      await interaction.reply({ content: t('mustBeInServer'), flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'find' || sub === 'mine') {
      await handleSearchSub(ctx, interaction, sub, t);
      return;
    }

    const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, interaction.channelId);
    if (!ticket) {
      await interaction.reply({ content: t('notTicketChannel'), flags: MessageFlags.Ephemeral });
      return;
    }

    const OPEN_ONLY_SUBS = ['close', 'claim', 'unclaim', 'transfer', 'add', 'remove', 'rename', 'priority', 'tag', 'note', 'respond', 'waiting', 'requestclose', 'snooze'];
    if (ticket.status === 'closed' && OPEN_ONLY_SUBS.includes(sub)) {
      if (sub === 'reopen') {

      } else {
        await interaction.reply({ content: t('alreadyClosed'), flags: MessageFlags.Ephemeral });
        return;
      }
    }

    const member = interaction.guild!.members.cache.get(interaction.user.id);
    const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);

    const isStaff = isTicketStaff(panel, ticket, member);

    switch (sub) {
      case 'close': {
        const reason = interaction.options.getString('reason') ?? undefined;
        const { closeTicket } = await import('../events/interaction.js');
        await closeTicket(ctx, interaction, ticket, reason);
        break;
      }
      case 'claim': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffClaim'), flags: MessageFlags.Ephemeral });
          return;
        }
        ticket.status = 'claimed';
        ticket.claimedBy = interaction.user.id;
        ticket.claimedByTag = interaction.user.tag;
        ticket.lastActivity = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        await updateControlsMessage(ctx, ticket, true);
        await interaction.reply(t('claimed', { user: interaction.user.tag }));
        await sendClaimBrief(ctx, interaction, ticket, t);
        break;
      }
      case 'unclaim': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffUnclaim'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (ticket.claimedBy !== interaction.user.id) {
          await interaction.reply({ content: t('onlyClaimerUnclaim'), flags: MessageFlags.Ephemeral });
          return;
        }
        ticket.status = 'open';
        ticket.claimedBy = undefined;
        ticket.claimedByTag = undefined;
        ticket.lastActivity = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        await updateControlsMessage(ctx, ticket, false);
        await interaction.reply(t('unclaimed'));
        break;
      }
      case 'reopen': {
        if (ticket.status !== 'closed') {
          await interaction.reply({ content: t('notClosed'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffReopen'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (!isReopenAllowed(panel?.reopenWindowHours, ticket.closedAt, Date.now())) {
          await interaction.reply({ content: t('reopenWindowExpired', { hours: panel!.reopenWindowHours! }), flags: MessageFlags.Ephemeral });
          return;
        }
        ticket.status = 'open';
        ticket.closedAt = undefined;
        ticket.closedBy = undefined;
        ticket.closedByTag = undefined;
        ticket.lastActivity = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);

        const channel = interaction.channel as TextChannel;

        if (panel?.closeAction === 'archive') {
          await restoreTicketChannel(channel, ticket).catch((err) =>
            ctx.logger.warn(`Failed to restore archived channel: ${err}`),
          );
        }

        const controls = buildTicketControls(channel.id, t);
        const controlsMsg = await channel.send({
          content: t('reopenedMsg', { user: interaction.user.tag, mention: `<@${ticket.userId}>` }),
          components: controls,
        });
        ticket.controlsMessageId = controlsMsg.id;
        await saveTicket(ctx.storage, interaction.guildId, ticket);

        await interaction.reply({ content: t('reopenedOk'), flags: MessageFlags.Ephemeral });
        break;
      }
      case 'transfer': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffTransfer'), flags: MessageFlags.Ephemeral });
          return;
        }
        const target = interaction.options.getUser('staff', true);
        const targetMember = interaction.guild!.members.cache.get(target.id) ?? await interaction.guild!.members.fetch(target.id).catch(() => null);
        if (!targetMember) {
          await interaction.reply({ content: t('userNotFound'), flags: MessageFlags.Ephemeral });
          return;
        }
        const targetIsStaff = isTicketStaff(panel, ticket, targetMember);
        if (!targetIsStaff) {
          await interaction.reply({ content: t('targetNotStaff'), flags: MessageFlags.Ephemeral });
          return;
        }

        ticket.transferredTo = target.id;
        ticket.transferredToTag = target.tag;
        ticket.claimedBy = target.id;
        ticket.claimedByTag = target.tag;
        ticket.status = 'claimed';
        ticket.lastActivity = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);

        const channel = interaction.channel as TextChannel;
        await addUserToTicket(channel, target.id).catch(() => null);
        await updateControlsMessage(ctx, ticket, true);
        await interaction.reply(t('transferred', { mention: `<@${target.id}>` }));
        await sendAssignmentBrief(ctx, ticket, targetMember, t, true);
        break;
      }
      case 'add': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffAdd'), flags: MessageFlags.Ephemeral });
          return;
        }
        const user = interaction.options.getUser('user', true);
        const channel = interaction.channel as TextChannel;
        await addUserToTicket(channel, user.id);
        await interaction.reply(t('addedUser', { mention: `<@${user.id}>` }));
        break;
      }
      case 'remove': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffRemove'), flags: MessageFlags.Ephemeral });
          return;
        }
        const user = interaction.options.getUser('user', true);
        if (user.id === ticket.userId) {
          await interaction.reply({ content: t('cannotRemoveOwner'), flags: MessageFlags.Ephemeral });
          return;
        }
        const channel = interaction.channel as TextChannel;
        await removeUserFromTicket(channel, user.id);
        await interaction.reply(t('removedUser', { mention: `<@${user.id}>` }));
        break;
      }
      case 'rename': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffRename'), flags: MessageFlags.Ephemeral });
          return;
        }
        const name = interaction.options.getString('name', true).toLowerCase().replace(/[^a-z0-9-]/g, '-');
        await (interaction.channel as TextChannel).setName(name);
        await interaction.reply(t('renamed', { name }));
        break;
      }
      case 'priority': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffPriority'), flags: MessageFlags.Ephemeral });
          return;
        }
        const level = interaction.options.getString('level', true) as typeof ticket.priority;
        ticket.priority = level;
        ticket.lastActivity = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        await updateControlsMessage(ctx, ticket, !!ticket.claimedBy);
        const emoji = { low: '🟢', medium: '🟡', high: '🟠', urgent: '🔴' }[level];
        await interaction.reply(t('prioritySet', { emoji, level: t('priority' + level.charAt(0).toUpperCase() + level.slice(1)) }));
        break;
      }
      case 'tag': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffTags'), flags: MessageFlags.Ephemeral });
          return;
        }
        const action = interaction.options.getString('action', true);
        const tag = interaction.options.getString('tag', true).toLowerCase();
        if (action === 'add') {
          if (!ticket.tags.includes(tag)) ticket.tags.push(tag);
          await interaction.reply(t('tagAdded', { tag }));
        } else {
          ticket.tags = ticket.tags.filter((t) => t !== tag);
          await interaction.reply(t('tagRemoved', { tag }));
        }
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        break;
      }
      case 'note': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffNotes'), flags: MessageFlags.Ephemeral });
          return;
        }
        const text = interaction.options.getString('text', true);
        const note: TicketNote = {
          id: randomUUID(),
          authorId: interaction.user.id,
          authorTag: interaction.user.tag,
          content: text,
          createdAt: new Date().toISOString(),
        };
        ticket.notes.push(note);
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        await interaction.reply({
          content: t('noteAdded'),
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
      case 'info': {
        if (!panel) {
          await interaction.reply({ content: t('panelDataNotFound'), flags: MessageFlags.Ephemeral });
          return;
        }
        const embed = buildInfoEmbed(ticket, panel, t);
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        break;
      }
      case 'transcript': {
        const isOwner = interaction.user.id === ticket.userId;
        if (!isStaff && !isOwner) {
          await interaction.reply({ content: t('onlyOwnerStaffTranscript'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (!panel) {
          await interaction.reply({ content: t('panelDataNotFound'), flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const messages = await getMessages(ctx.storage, ticket.channelId);
        const html = generateTranscriptHtml(ticket, panel, messages, t, isStaff);
        const embed = buildTranscriptEmbed(ticket, messages.length, t);
        await interaction.editReply({
          embeds: [embed],
          files: [{ attachment: html, name: `ticket-${ticket.number}.html` }],
        });
        break;
      }
      case 'notes': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffViewNotes'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (ticket.notes.length === 0) {
          await interaction.reply({ content: t('noNotes'), flags: MessageFlags.Ephemeral });
          return;
        }
        const noteLines = ticket.notes.map((n, i) => {
          const time = new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `**${i + 1}.** ${n.content}\n> — ${n.authorTag} • ${time}`;
        });
        await interaction.reply({
          content: `${t('notesHeader', { num: ticket.number, count: ticket.notes.length })}\n\n${noteLines.join('\n\n')}`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
      case 'respond': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffCanned'), flags: MessageFlags.Ephemeral });
          return;
        }
        const name = interaction.options.getString('name', true);
        const responses = await getCannedResponses(ctx.storage, interaction.guildId);
        const canned = responses.find((r) => r.name.toLowerCase() === name.toLowerCase());
        if (!canned) {
          await interaction.reply({ content: t('cannedNotFound', { name }), flags: MessageFlags.Ephemeral });
          return;
        }

        const opener = await interaction.guild!.members.fetch(ticket.userId).catch(() => null);
        const content = applyCannedVars(canned.content, {
          user: `<@${ticket.userId}>`,
          username: opener?.user.username ?? ticket.username,
          staff: `<@${interaction.user.id}>`,
          staffname: interaction.user.username,
          ticket: `#${ticket.number}`,
        });
        await interaction.reply(content);
        break;
      }
      case 'requestclose': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffRequestClose'), flags: MessageFlags.Ephemeral });
          return;
        }
        ticket.closeRequestedBy = interaction.user.id;
        ticket.closeRequestedByTag = interaction.user.tag;
        ticket.closeRequestedAt = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket:confirmclose:${ticket.channelId}`).setLabel(t('btnConfirmClose')).setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ticket:keepopen:${ticket.channelId}`).setLabel(t('btnKeepOpen')).setEmoji('🔓').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({ content: t('closeRequestPrompt', { user: `<@${ticket.userId}>` }), components: [row] });
        break;
      }
      case 'snooze': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffSnooze'), flags: MessageFlags.Ephemeral });
          return;
        }
        const raw = interaction.options.getString('in', true);
        const ms = parseDuration(raw);
        if (!ms || ms < 60_000 || ms > 30 * 24 * 60 * 60 * 1000) {
          await interaction.reply({ content: t('snoozeBadDuration'), flags: MessageFlags.Ephemeral });
          return;
        }
        ticket.reminderAt = new Date(Date.now() + ms).toISOString();
        ticket.reminderBy = interaction.user.id;
        await saveTicket(ctx.storage, interaction.guildId, ticket);
        const when = Math.floor((Date.now() + ms) / 1000);
        await interaction.reply({ content: t('snoozeSet', { when: `<t:${when}:R>` }), flags: MessageFlags.Ephemeral });
        break;
      }
      case 'waiting': {
        if (!isStaff) {
          await interaction.reply({ content: t('onlyStaffWaiting'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (ticket.status === 'waiting') {
          ticket.status = ticket.claimedBy ? 'claimed' : 'open';
          ticket.lastActivity = new Date().toISOString();
          await saveTicket(ctx.storage, interaction.guildId, ticket);
          await updateControlsMessage(ctx, ticket, !!ticket.claimedBy);
          await interaction.reply({ content: t('markedActive'), flags: MessageFlags.Ephemeral });
        } else {
          ticket.status = 'waiting';
          ticket.lastActivity = new Date().toISOString();
          await saveTicket(ctx.storage, interaction.guildId, ticket);
          await updateControlsMessage(ctx, ticket, !!ticket.claimedBy);
          await interaction.reply({ content: t('setWaiting'), flags: MessageFlags.Ephemeral });
        }
        break;
      }
    }
  },
};

async function handleSearchSub(
  ctx: AddonContext,
  interaction: ChatInputCommandInteraction,
  sub: string,
  t: (k: string, v?: Record<string, string | number>) => string,
): Promise<void> {
  const guildId = interaction.guildId!;

  if (sub === 'mine') {
    const open = await getUserOpenTickets(ctx.storage, guildId, interaction.user.id);
    if (open.length === 0) {
      await interaction.reply({ content: t('mineNone'), flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = open
      .sort((a, b) => b.number - a.number)
      .map((x) => `• **#${x.number}** → <#${x.channelId}>`);
    await interaction.reply({ content: `${t('mineHeader', { count: open.length })}\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.guild!.members.cache.get(interaction.user.id)
    ?? (await interaction.guild!.members.fetch(interaction.user.id).catch(() => null));
  const panels = await getPanels(ctx.storage, guildId);
  const staffRoleIds = new Set(panels.flatMap((p) => p.staffRoles));
  const isStaff =
    !!member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    [...staffRoleIds].some((r) => member?.roles.cache.has(r));
  if (!isStaff) {
    await interaction.reply({ content: t('onlyStaffFind'), flags: MessageFlags.Ephemeral });
    return;
  }

  const query = interaction.options.getString('query', true).trim().toLowerCase();
  const numStr = query.replace(/^#/, '');
  const idStr = query.replace(/[<@!>]/g, '');
  const all = await getTickets(ctx.storage, guildId);
  const matches = all
    .filter((x) =>
      String(x.number) === numStr ||
      x.username.toLowerCase().includes(query) ||
      x.userId === idStr ||
      x.tags.some((tag) => tag.toLowerCase().includes(query)) ||
      (x.categoryTag?.toLowerCase().includes(query) ?? false),
    )
    .sort((a, b) => b.number - a.number)
    .slice(0, 15);

  if (matches.length === 0) {
    await interaction.reply({ content: t('findNone', { query }), flags: MessageFlags.Ephemeral });
    return;
  }
  const emoji: Record<string, string> = { open: '🟢', claimed: '🔵', waiting: '🟡', closed: '⬛' };
  const lines = matches.map((x) =>
    `${emoji[x.status] ?? '•'} **#${x.number}** — ${x.username}${x.categoryTag ? ` \`${x.categoryTag}\`` : ''}${x.status === 'closed' ? ` (${t('statusClosedShort')})` : ` → <#${x.channelId}>`}`,
  );
  await interaction.reply({ content: `${t('findHeader', { count: matches.length })}\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
}

export default command;

