import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
  type TextChannel,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import type { TicketNote } from '../types.js';
import {
  getTicketByChannel,
  saveTicket,
  getMessages,
  getPanel,
  getCannedResponses,
  getTickets,
} from '../utils/storage.js';
import {
  buildInfoEmbed,
  buildTranscriptEmbed,
  buildTicketControls,
} from '../utils/embeds.js';
import { generateTranscriptHtml } from '../utils/transcript.js';
import {
  addUserToTicket,
  removeUserFromTicket,
  restoreTicketChannel,
} from '../utils/channel.js';
import { updateControlsMessage } from '../events/interaction.js';

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
    ) as unknown as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.guildId) return;
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'tag') {
      // Collect all unique tags used in this guild's tickets
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
      // Canned response autocomplete
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

    const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, interaction.channelId);
    if (!ticket) {
      await interaction.reply({ content: t('notTicketChannel'), flags: MessageFlags.Ephemeral });
      return;
    }

    const OPEN_ONLY_SUBS = ['close', 'claim', 'unclaim', 'transfer', 'add', 'remove', 'rename', 'priority', 'tag', 'note', 'respond', 'waiting'];
    if (ticket.status === 'closed' && OPEN_ONLY_SUBS.includes(sub)) {
      if (sub === 'reopen') {
        // handled below
      } else {
        await interaction.reply({ content: t('alreadyClosed'), flags: MessageFlags.Ephemeral });
        return;
      }
    }

    const member = interaction.guild!.members.cache.get(interaction.user.id);
    const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);

    // Staff check helper
    const isStaff =
      panel &&
      (panel.staffRoles.length === 0 ||
        panel.staffRoles.some((rid) => member?.roles.cache.has(rid)));

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
        ticket.status = 'open';
        ticket.closedAt = undefined;
        ticket.closedBy = undefined;
        ticket.closedByTag = undefined;
        ticket.lastActivity = new Date().toISOString();
        await saveTicket(ctx.storage, interaction.guildId, ticket);

        const channel = interaction.channel as TextChannel;
        // Restore permissions if the channel was archived
        if (panel?.closeAction === 'archive') {
          await restoreTicketChannel(channel, ticket).catch((err) =>
            ctx.logger.warn(`Failed to restore archived channel: ${err}`),
          );
        }
        // Post reopen message and re-pin controls
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
        const targetIsStaff =
          !panel ||
          panel.staffRoles.length === 0 ||
          panel.staffRoles.some((rid) => targetMember.roles.cache.has(rid));
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

        // Add new staff to the channel if not already present
        const channel = interaction.channel as TextChannel;
        await addUserToTicket(channel, target.id).catch(() => null);
        await updateControlsMessage(ctx, ticket, true);
        await interaction.reply(t('transferred', { mention: `<@${target.id}>` }));
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
        await interaction.reply(canned.content);
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

export default command;

