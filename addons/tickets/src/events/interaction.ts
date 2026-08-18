import {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  type Interaction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type Guild,
  type Message,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { jsonCompletion, isLLMAvailable, LLMUnavailableError } from '@arkenbot/shared';
import type { Ticket, TicketPanel, TicketNote } from '../types.js';
import {
  getPanel,
  getConfig,
  saveConfig,
  getUserOpenTickets,
  nextTicketNumber,
  saveTicket,
  getTicketByChannel,
  getMessages,
} from '../utils/storage.js';
import {
  buildTicketEmbed,
  buildTicketControls,
  buildClaimedControls,
  buildClosedEmbed,
  buildRatingEmbed,
  buildRatingButtons,
  buildTranscriptEmbed,
} from '../utils/embeds.js';
import { createTicketChannel, archiveTicketChannel, restoreTicketChannel, resolveChannelName } from '../utils/channel.js';
import { generateTranscriptHtml } from '../utils/transcript.js';

const CUSTOM_ID_PREFIX = 'ticket:';

/**
 * Pending close timers keyed by channelId.
 * Used to cancel the fallback timer when the user submits their rating.
 */
const pendingClose = new Map<string, ReturnType<typeof setTimeout>>();

export function isTicketInteraction(interaction: Interaction): boolean {
  if (interaction.isButton()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  if (interaction.isModalSubmit()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  return false;
}

export async function handleTicketInteraction(
  ctx: AddonContext,
  interaction: Interaction,
): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(ctx, interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModal(ctx, interaction);
  }
}

// ─── Button Handler ───────────────────────────────────────────────────────────

async function handleButton(ctx: AddonContext, interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith('ticket:open:')) {
    // Format: ticket:open:{panelId} OR ticket:open:{panelId}:{buttonId}
    const parts = id.slice('ticket:open:'.length).split(':');
    const panelId = parts[0];
    const buttonId = parts[1];
    await handleOpenTicket(ctx, interaction, panelId, buttonId);
  } else if (id.startsWith('ticket:close:')) {
    const channelId = id.slice('ticket:close:'.length);
    await handleCloseButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:claim:')) {
    const channelId = id.slice('ticket:claim:'.length);
    await handleClaimButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:unclaim:')) {
    const channelId = id.slice('ticket:unclaim:'.length);
    await handleUnclaimButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:transcript:')) {
    const channelId = id.slice('ticket:transcript:'.length);
    await handleTranscriptButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:reopen:')) {
    const channelId = id.slice('ticket:reopen:'.length);
    await handleReopenButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:rate:')) {
    const parts = id.split(':'); // ticket:rate:guildId:channelId:rating
    const guildId = parts[2];
    const channelId = parts[3];
    const rating = parseInt(parts[4] ?? '0', 10);
    await handleRateButton(ctx, interaction, guildId, channelId, rating);
  } else if (id.startsWith('ticket:waiting:')) {
    const channelId = id.slice('ticket:waiting:'.length);
    await handleWaitingButton(ctx, interaction, channelId);
  }
}

// ─── Open Ticket ──────────────────────────────────────────────────────────────

async function handleOpenTicket(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  panelId: string,
  buttonId?: string,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel || !panel.enabled) {
    await interaction.reply({ content: t('panelNotAvailable'), flags: MessageFlags.Ephemeral });
    return;
  }

  // Blacklist check
  const config = await getConfig(ctx.storage, guildId);
  if (config.blacklistedUsers.includes(interaction.user.id)) {
    await interaction.reply({
      content: t('notAllowedOpen'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Max tickets check
  const openTickets = await getUserOpenTickets(ctx.storage, guildId, interaction.user.id);
  if (openTickets.length >= panel.maxTicketsPerUser) {
    const existing = openTickets[0];
    await interaction.reply({
      content: t('tooManyOpen', { count: openTickets.length, existing: existing ? `→ <#${existing.channelId}>` : '' }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Resolve category tag from the clicked button
  const categoryTag = buttonId
    ? panel.buttons?.find((b) => b.id === buttonId)?.categoryTag
    : undefined;

  if (panel.fields && panel.fields.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket:reason:${panelId}${buttonId ? `:${buttonId}` : ''}`)
      .setTitle(t('modalOpenTitle'));
    const fieldRows = panel.fields.slice(0, 5).map((f) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(f.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
          .setRequired(f.required)
          .setMaxLength(f.maxLength ?? 1000)
          .setPlaceholder(f.placeholder ?? ''),
      ),
    );
    modal.addComponents(...fieldRows);
    await interaction.showModal(modal);
  } else if (panel.requireReason) {
    // Embed buttonId in modal customId so it survives through the modal submit
    const modal = new ModalBuilder()
      .setCustomId(`ticket:reason:${panelId}${buttonId ? `:${buttonId}` : ''}`)
      .setTitle(t('modalOpenTitle'))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel(t('modalDescribeLabel'))
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(t('modalDescribePlaceholder'))
            .setRequired(true)
            .setMaxLength(500),
        ),
      );
    await interaction.showModal(modal);
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await createTicket(ctx, interaction.guild, interaction.user.id, interaction.user.tag, panel, undefined, interaction, categoryTag);
  }
}

// ─── Create Ticket ────────────────────────────────────────────────────────────

export async function createTicket(
  ctx: AddonContext,
  guild: Guild,
  userId: string,
  userTag: string,
  panel: TicketPanel,
  reason: string | undefined,
  interaction: ButtonInteraction | ModalSubmitInteraction,
  categoryTag?: string,
  formResponses?: Record<string, string>,
): Promise<void> {
  const guildId = guild.id;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) {
    await interaction.editReply(t('couldNotFetchMember'));
    return;
  }

  const number = await nextTicketNumber(ctx.storage, guildId);
  const channelName = resolveChannelName(panel, number, member.displayName);

  let channel: TextChannel;
  try {
    channel = await createTicketChannel(guild, panel, member, channelName);
  } catch (err) {
    ctx.logger.error('Failed to create ticket channel', String(err));
    await interaction.editReply(t('failedCreateChannel'));
    return;
  }

  const ticket: Ticket = {
    id: randomUUID(),
    number,
    panelId: panel.id,
    guildId,
    channelId: channel.id,
    userId,
    username: userTag,
    status: 'open',
    priority: 'medium',
    categoryTag,
    tags: categoryTag ? [categoryTag] : [],
    notes: [],
    reason,
    formResponses,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };

  // Save ticket first so it's always recorded even if the send fails
  await saveTicket(ctx.storage, guildId, ticket);

  // Send welcome embed + controls
  try {
    const embed = buildTicketEmbed(ticket, panel, member, t);
    const controls = buildTicketControls(channel.id, t);
    const controlsMsg = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: controls });
    ticket.controlsMessageId = controlsMsg.id;
    await saveTicket(ctx.storage, guildId, ticket);
  } catch (err) {
    ctx.logger.warn(`Failed to send welcome embed in ticket #${number}: ${err}`);
  }

  await interaction.editReply(t('ticketCreated', { channel: String(channel) }));

  ctx.logger.info(`Ticket #${number} created in guild ${guildId} by ${userTag}`);

  // Fire webhook
  const config = await getConfig(ctx.storage, guildId);
  if (config.webhookUrl) {
    fireWebhook(config.webhookUrl, {
      event: 'ticket.opened',
      ticketId: ticket.id,
      number: ticket.number,
      panelName: panel.name,
      userId,
      username: userTag,
      channelId: channel.id,
      guildId,
      createdAt: ticket.createdAt,
    }).catch((err) => ctx.logger.warn(`Webhook delivery failed (ticket.opened): ${err}`));
  }

  // Staff notification
  if (config.staffNotifyChannelId) {
    const notifyChannel = guild.channels.cache.get(config.staffNotifyChannelId) as TextChannel | undefined;
    if (notifyChannel?.isTextBased() && 'send' in notifyChannel) {
      const rolePing = config.staffNotifyRoleId ? `<@&${config.staffNotifyRoleId}> ` : '';
      let formSummary = '';
      if (formResponses && panel.fields && panel.fields.length > 0) {
        formSummary = panel.fields
          .filter((f) => formResponses![f.id])
          .map((f) => `> **${f.label}:** ${formResponses![f.id]}`)
          .join('\n');
      } else if (reason) {
        formSummary = `> ${reason}`;
      }
      await notifyChannel.send(
        `${rolePing}📬 New ticket **#${ticket.number}** opened by <@${userId}>${ticket.categoryTag ? ` — \`${ticket.categoryTag}\`` : ''}${formSummary ? `\n${formSummary}` : ''}\n→ <#${channel.id}>`,
      ).catch(() => null);
    }
  }

  // Auto-assign
  if (config.autoAssign && panel.staffRoles.length > 0) {
    try {
      const staffRole = guild.roles.cache.get(panel.staffRoles[0]);
      if (staffRole) {
        await guild.members.fetch();
        const staffMembers = staffRole.members.filter((m) => !m.user.bot).toJSON();
        if (staffMembers.length > 0) {
          const idx = (config.roundRobinIndex ?? 0) % staffMembers.length;
          const assignee = staffMembers[idx];
          config.roundRobinIndex = (idx + 1) % staffMembers.length;
          await saveConfig(ctx.storage, guildId, config);
          ticket.status = 'claimed';
          ticket.claimedBy = assignee.id;
          ticket.claimedByTag = assignee.user.tag;
          await saveTicket(ctx.storage, guildId, ticket);
          await channel.send(t('autoAssigned', { mention: `<@${assignee.id}>` })).catch(() => null);
        }
      }
    } catch (err) {
      ctx.logger.warn(`Auto-assign failed: ${err}`);
    }
  }
}

// ─── Close Ticket ─────────────────────────────────────────────────────────────

async function handleCloseButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  await closeTicket(ctx, interaction, ticket, undefined);
}

/**
 * Finalize a ticket close: send the staff transcript to the log channel,
 * fire any webhook, then delete or archive the Discord channel.
 * Safe to call from both the fallback timer and immediately after rating.
 */
async function finalizeTicketClose(
  ctx: AddonContext,
  guildId: string,
  channelId: string,
  closeAction: 'delete' | 'archive',
  logChannelId: string | undefined,
  panel: TicketPanel | null,
  webhookUrl: string | undefined,
): Promise<void> {
  const loc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: ctx.getGuild(guildId)?.preferredLocale });
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  // Cancel any pending fallback timer so it doesn't run twice
  const existing = pendingClose.get(channelId);
  if (existing) {
    clearTimeout(existing);
    pendingClose.delete(channelId);
  }

  const freshTicket = await getTicketByChannel(ctx.storage, guildId, channelId);
  if (!freshTicket) return;

  const channel = ctx.client.channels.cache.get(channelId) as TextChannel | undefined;
  const freshMessages = await getMessages(ctx.storage, channelId);

  // Send staff transcript to log channel (includes staff notes)
  if (logChannelId && panel && channel) {
    const logChannel = ctx.client.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (logChannel) {
      try {
        const transcriptEmbed = buildTranscriptEmbed(freshTicket, freshMessages.length, t);
        const staffHtml = generateTranscriptHtml(freshTicket, panel, freshMessages, t, true);
        await logChannel.send({
          embeds: [transcriptEmbed],
          files: [{ attachment: staffHtml, name: `ticket-${freshTicket.number}.html` }],
        });
      } catch (err) {
        ctx.logger.warn(`Failed to send staff transcript: ${err}`);
      }
    }
  }

  // Fire webhook with final rating data
  if (webhookUrl) {
    fireWebhook(webhookUrl, {
      event: 'ticket.closed',
      ticketId: freshTicket.id,
      number: freshTicket.number,
      panelName: panel?.name,
      userId: freshTicket.userId,
      username: freshTicket.username,
      closedBy: freshTicket.closedByTag,
      reason: freshTicket.reason,
      guildId,
      closedAt: freshTicket.closedAt,
      rating: freshTicket.rating,
    }).catch((err) => ctx.logger.warn(`Webhook delivery failed (ticket.closed): ${err}`));
  }

  // Delete or archive channel
  if (channel) {
    try {
      if (closeAction === 'archive') {
        await archiveTicketChannel(channel, freshTicket);
      } else {
        await channel.delete(`Ticket #${freshTicket.number} closed by ${freshTicket.closedByTag}`);
      }
    } catch (err) {
      ctx.logger.error('Failed to delete/archive ticket channel', String(err));
    }
  }
}

/**
 * Exported so the `/ticket close` command can call this same logic.
 */
export async function closeTicket(
  ctx: AddonContext,
  interaction: ButtonInteraction | import('discord.js').ChatInputCommandInteraction,
  ticket: Ticket,
  reason: string | undefined,
): Promise<void> {
  const guildId = ticket.guildId;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ownerLoc = await ctx.resolveLocale({ user: { id: ticket.userId }, guildId, guildLocale: ctx.getGuild(guildId)?.preferredLocale });
  const ownerT = (k: string, v?: Record<string, string | number>) => ctx.t(k, ownerLoc, v);
  const channel = ctx.client.channels.cache.get(ticket.channelId) as TextChannel | undefined;
  const panel = await getPanel(ctx.storage, guildId, ticket.panelId);
  const config = await getConfig(ctx.storage, guildId);

  ticket.status = 'closed';
  ticket.closedBy = interaction.user.id;
  ticket.closedByTag = interaction.user.tag;
  ticket.closedAt = new Date().toISOString();
  if (reason) ticket.reason = reason;
  await saveTicket(ctx.storage, guildId, ticket);

  // Send closed embed
  const closeAction = panel?.closeAction ?? 'delete';
  const closedEmbed = buildClosedEmbed(ticket, interaction.user.tag, ownerT);
  if (channel) {
    try {
      if (closeAction === 'archive') {
        const { buildReopenButton } = await import('../utils/embeds.js');
        await channel.send({ embeds: [closedEmbed], components: [buildReopenButton(channel.id, ownerT)] });
      } else {
        await channel.send({ embeds: [closedEmbed] });
      }
    } catch (err) {
      ctx.logger.warn(`Could not send close embed to ticket channel: ${err}`);
    }
  }

  const messages = await getMessages(ctx.storage, ticket.channelId);
  const resolvedLogChannelId = panel?.logChannelId ?? config.transcriptChannelId;

  // DM the user their transcript (no staff notes)
  if (panel) {
    try {
      const user = await ctx.client.users.fetch(ticket.userId);
      const userHtml = generateTranscriptHtml(ticket, panel, messages, ownerT, false);
      await user.send({
        content: ownerT('transcriptDmContent', { num: ticket.number }),
        files: [{ attachment: userHtml, name: `ticket-${ticket.number}.html` }],
      });
    } catch {
      // User may have DMs disabled — non-fatal
    }
  }

  // Send rating prompt
  if (channel && closeAction === 'delete') {
    try {
      const ratingEmbed = buildRatingEmbed(ticket, ownerT);
      const ratingRow = buildRatingButtons(guildId, ticket.channelId);
      await channel.send({
        content: ownerT('pleaseRateClose', { mention: `<@${ticket.userId}>` }),
        embeds: [ratingEmbed],
        components: [ratingRow],
      });
    } catch (err) {
      ctx.logger.warn(`Could not send rating prompt to ticket channel: ${err}`);
    }
  } else if (channel && closeAction === 'archive') {
    try {
      const ratingEmbed = buildRatingEmbed(ticket, ownerT);
      const ratingRow = buildRatingButtons(guildId, ticket.channelId);
      await channel.send({
        content: ownerT('pleaseRate', { mention: `<@${ticket.userId}>` }),
        embeds: [ratingEmbed],
        components: [ratingRow],
      });
    } catch (err) {
      ctx.logger.warn(`Could not send rating prompt to ticket channel: ${err}`);
    }
  }

  // Reply to interaction
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(t('ticketBeingClosed'));
  } else {
    await interaction.reply({ content: t('closingTicket'), flags: MessageFlags.Ephemeral });
  }

  // For delete: finalize after rating is submitted (handleRateModal calls finalizeTicketClose).
  // Start a 10-minute fallback timer in case the user skips rating.
  // For archive: run finalization after the rating window; the channel will be archived not deleted.
  const fallbackMs = (config.ratingWindowMinutes ?? 10) * 60 * 1000;
  const timer = setTimeout(async () => {
    pendingClose.delete(ticket.channelId);
    try {
      await finalizeTicketClose(ctx, guildId, ticket.channelId, closeAction, resolvedLogChannelId as string | undefined, panel ?? null, config.webhookUrl);
    } catch (err) {
      ctx.logger.error('Fallback close timer failed', String(err));
    }
  }, fallbackMs);
  pendingClose.set(ticket.channelId, timer);
}

// ─── Reopen Button ────────────────────────────────────────────────────────────

async function handleReopenButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.status !== 'closed') {
    await interaction.reply({ content: t('notClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const reopenEffectiveStaffRoles = panel?.staffRoles ?? [];
  const isStaff =
    !panel ||
    reopenEffectiveStaffRoles.length === 0 ||
    reopenEffectiveStaffRoles.some((rid) => member?.roles.cache.has(rid));

  if (!isStaff) {
    await interaction.reply({ content: t('onlyStaffReopen'), flags: MessageFlags.Ephemeral });
    return;
  }

  ticket.status = 'open';
  ticket.closedAt = undefined;
  ticket.closedBy = undefined;
  ticket.closedByTag = undefined;
  ticket.lastActivity = new Date().toISOString();

  const channel = ctx.client.channels.cache.get(channelId) as TextChannel | undefined;
  if (channel) {
    // Restore access if the channel was archived
    const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
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
  }

  await saveTicket(ctx.storage, interaction.guildId, ticket);
  await interaction.reply({ content: t('reopenedOk'), flags: MessageFlags.Ephemeral });

  // Disable the reopen button
  await interaction.message.edit({ components: [] }).catch(() => null);
}

// ─── Claim / Unclaim ──────────────────────────────────────────────────────────

async function handleClaimButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const clickedButton = panel?.buttons?.find((b) => interaction.message?.components?.some((row) => ('components' in row ? (row.components as { customId?: string }[]).some((c) => c.customId?.includes(b.id)) : false)));
  const effectiveStaffRoles = clickedButton?.staffRoles ?? panel?.staffRoles ?? [];
  const isStaff =
    !panel ||
    effectiveStaffRoles.length === 0 ||
    effectiveStaffRoles.some((rid) => member?.roles.cache.has(rid));

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
}

/**
 * Generates an AI triage of the ticket for staff — a short summary of the user's
 * issue, an urgency estimate, and a suggested first reply. Shown ephemerally so
 * the suggestion stays private to the staff member who requested it, and only run
 * on demand to keep the model cost bounded. Invoked by the `/ticket triage`
 * subcommand.
 */
export async function generateTriage(
  ctx: AddonContext,
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const effectiveStaffRoles = panel?.staffRoles ?? [];
  const isStaff =
    !panel ||
    effectiveStaffRoles.length === 0 ||
    effectiveStaffRoles.some((rid) => member?.roles.cache.has(rid));
  if (!isStaff) {
    await interaction.reply({ content: t('aiOnlyStaff'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isLLMAvailable()) {
    await interaction.reply({
      content: t('aiUnavailable'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const details: string[] = [];
  if (ticket.reason) details.push(`Reason given: ${ticket.reason}`);
  for (const [k, v] of Object.entries(ticket.formResponses ?? {})) details.push(`${k}: ${v}`);

  let transcript: string[] = [];
  const channel = interaction.channel;
  if (channel && 'messages' in channel) {
    try {
      const fetched = await channel.messages.fetch({ limit: 40 });
      transcript = [...fetched.values()]
        .reverse()
        .filter((m: Message) => m.content.trim().length > 0)
        .map((m: Message) => `${m.author.bot ? '[bot] ' : ''}${m.author.username}: ${m.content.replace(/\n+/g, ' ').slice(0, 300)}`);
    } catch { /* fall back to just the ticket details */ }
  }

  const context = [
    details.length ? `Ticket details:\n${details.join('\n')}` : '',
    transcript.length ? `Conversation so far:\n${transcript.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  if (!context) {
    await interaction.editReply(t('aiNothing'));
    return;
  }

  try {
    const result = await jsonCompletion<{ summary?: string; urgency?: string; reply?: string }>(
      [
        {
          role: 'system',
          content:
            'You triage support tickets for staff. Given the ticket details and conversation, respond with a JSON object ' +
            '{"summary": string, "urgency": "low"|"medium"|"high", "reply": string}. ' +
            '"summary" is 1-2 sentences describing the user\'s issue. "urgency" reflects how time-sensitive it is. ' +
            '"reply" is a friendly, helpful first response a staff member could send, ready to adapt. ' +
            'Base everything only on the provided content; do not invent facts.',
        },
        { role: 'user', content: context },
      ],
      { temperature: 0.3, maxTokens: 600 },
    );

    const urgency = (result.urgency ?? 'medium').toLowerCase();
    const urgencyMeta: Record<string, { emoji: string; color: number }> = {
      low: { emoji: '🟢', color: 0x57f287 },
      medium: { emoji: '🟡', color: 0xfee75c },
      high: { emoji: '🔴', color: 0xed4245 },
    };
    const meta = urgencyMeta[urgency] ?? urgencyMeta.medium;

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(t('aiTriageTitle', { num: ticket.number }))
      .addFields(
        { name: t('aiFieldSummary'), value: (result.summary ?? 'No summary produced.').slice(0, 1024) },
        { name: t('aiFieldUrgency'), value: `${meta.emoji} ${t('priority' + urgency.charAt(0).toUpperCase() + urgency.slice(1))}`, inline: true },
        { name: t('aiFieldReply'), value: (result.reply ?? '—').slice(0, 1024) },
      )
      .setFooter({ text: 'AI-generated · only you can see this · review before sending' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof LLMUnavailableError) {
      await interaction.editReply(t('aiUnavailable'));
      return;
    }
    ctx.logger.warn(`Ticket AI triage failed: ${err instanceof Error ? err.message : String(err)}`);
    await interaction.editReply(t('aiError'));
  }
}

async function handleUnclaimButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
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
}

export async function updateControlsMessage(ctx: AddonContext, ticket: Ticket, claimed: boolean): Promise<void> {
  if (!ticket.controlsMessageId) return;
  const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: ticket.guildId, guildLocale: ctx.getGuild(ticket.guildId)?.preferredLocale });
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const channel = ctx.client.channels.cache.get(ticket.channelId) as TextChannel | undefined;
  if (!channel) return;
  const msg = await channel.messages.fetch(ticket.controlsMessageId).catch(() => null);
  if (!msg) return;
  const waiting = ticket.status === 'waiting';
  const components = claimed ? buildClaimedControls(ticket.channelId, t, waiting) : buildTicketControls(ticket.channelId, t, waiting);
  const panel = await getPanel(ctx.storage, channel.guildId, ticket.panelId);
  const member = channel.guild.members.cache.get(ticket.userId)
    ?? await channel.guild.members.fetch(ticket.userId).catch(() => null);
  if (panel && member) {
    const embed = buildTicketEmbed(ticket, panel, member, t);
    await msg.edit({ embeds: [embed], components }).catch(() => null);
  } else {
    await msg.edit({ components }).catch(() => null);
  }
}

// ─── Transcript Button ────────────────────────────────────────────────────────

async function handleTranscriptButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  if (!panel) {
    await interaction.reply({ content: t('panelNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const transcriptClickedButton = panel.buttons?.find((b) => interaction.message?.components?.some((row) => ('components' in row ? (row.components as { customId?: string }[]).some((c) => c.customId?.includes(b.id)) : false)));
  const transcriptEffectiveRoles = transcriptClickedButton?.staffRoles ?? panel.staffRoles;
  const isStaff =
    transcriptEffectiveRoles.length === 0 || transcriptEffectiveRoles.some((rid) => member?.roles.cache.has(rid));
  const isOwner = interaction.user.id === ticket.userId;

  if (!isStaff && !isOwner) {
    await interaction.reply({ content: t('onlyOwnerStaffTranscript'), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const messages = await getMessages(ctx.storage, channelId);
  // Staff always gets the notes-included version; users get the public version
  const html = generateTranscriptHtml(ticket, panel, messages, t, isStaff);
  const embed = buildTranscriptEmbed(ticket, messages.length, t);
  await interaction.editReply({
    embeds: [embed],
    files: [{ attachment: html, name: `ticket-${ticket.number}.html` }],
  });
}

// ─── Rating ───────────────────────────────────────────────────────────────────

async function handleRateButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  guildId: string,
  channelId: string,
  rating: number,
): Promise<void> {
  const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({ content: t('onlyOwnerRate'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (ticket.rating !== undefined) {
    await interaction.reply({ content: t('alreadyRated'), flags: MessageFlags.Ephemeral });
    return;
  }

  // Show a modal so the user can optionally leave text feedback
  const modal = new ModalBuilder()
    .setCustomId(`ticket:rate-modal:${guildId}:${channelId}:${rating}`)
    .setTitle(`${t('rateModalTitle')} (${'⭐'.repeat(rating)})`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel(t('rateFeedbackLabel'))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder(t('rateFeedbackPlaceholder')),
      ),
    );

  await interaction.showModal(modal);
}

// ─── Modal Handler ────────────────────────────────────────────────────────────

async function handleModal(ctx: AddonContext, interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith('ticket:reason:')) {
    // Format: ticket:reason:{panelId} OR ticket:reason:{panelId}:{buttonId}
    const parts = id.slice('ticket:reason:'.length).split(':');
    await handleReasonModal(ctx, interaction, parts[0], parts[1]);
  } else if (id.startsWith('ticket:rate-modal:')) {
    const parts = id.split(':'); // ticket:rate-modal:guildId:channelId:rating
    const guildId = parts[2];
    const channelId = parts[3];
    const rating = parseInt(parts[4] ?? '0', 10);
    await handleRateModal(ctx, interaction, guildId, channelId, rating);
  }
}

// ─── Rate Modal Handler ───────────────────────────────────────────────────────

async function handleRateModal(
  ctx: AddonContext,
  interaction: ModalSubmitInteraction,
  guildId: string,
  channelId: string,
  rating: number,
): Promise<void> {
  const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({ content: t('onlyOwnerRate'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.rating !== undefined) {
    await interaction.reply({ content: t('alreadyRated'), flags: MessageFlags.Ephemeral });
    return;
  }

  const feedback = interaction.fields.getTextInputValue('feedback').trim() || undefined;
  ticket.rating = rating;
  ticket.ratingFeedback = feedback;
  await saveTicket(ctx.storage, guildId, ticket);

  await interaction.reply({
    content: `${'⭐'.repeat(rating)} Thank you for your rating!${feedback ? ' Your comments have been recorded.' : ''} This channel will now be closed.`,
    flags: MessageFlags.Ephemeral,
  });

  // Trigger finalization now that rating is complete (cancels the fallback timer)
  const panel = await getPanel(ctx.storage, guildId, ticket.panelId);
  const config = await getConfig(ctx.storage, guildId);
  const closeAction = panel?.closeAction ?? 'delete';
  const logChannelId = (panel?.logChannelId ?? config.transcriptChannelId) as string | undefined;
  await finalizeTicketClose(ctx, guildId, channelId, closeAction, logChannelId, panel ?? null, config.webhookUrl).catch((err) =>
    ctx.logger.error('Failed to finalize ticket after rating', String(err)),
  );
}

async function handleReasonModal(
  ctx: AddonContext,
  interaction: ModalSubmitInteraction,
  panelId: string,
  buttonId?: string,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel) {
    await interaction.reply({ content: t('panelNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  const categoryTag = buttonId ? panel.buttons?.find((b) => b.id === buttonId)?.categoryTag : undefined;

  let reason: string | undefined;
  let formResponses: Record<string, string> | undefined;

  if (panel.fields && panel.fields.length > 0) {
    formResponses = {};
    for (const field of panel.fields) {
      try {
        const val = interaction.fields.getTextInputValue(field.id).trim();
        if (val) formResponses[field.id] = val;
      } catch {
        // field not present
      }
    }
    const firstTextField = panel.fields[0];
    if (firstTextField && formResponses[firstTextField.id]) {
      reason = formResponses[firstTextField.id];
    }
  } else {
    reason = interaction.fields.getTextInputValue('reason').trim();
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await createTicket(ctx, interaction.guild, interaction.user.id, interaction.user.tag, panel, reason, interaction, categoryTag, formResponses);
}

// ─── Waiting Button ───────────────────────────────────────────────────────────

async function handleWaitingButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const effectiveRoles = panel?.staffRoles ?? [];
  const isStaff =
    !panel ||
    effectiveRoles.length === 0 ||
    effectiveRoles.some((rid) => member?.roles.cache.has(rid));

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
}

// Notes are saved to the ticket record and visible in the dashboard.
 
export async function postNoteToThread(_ctx: AddonContext, _ticket: Ticket, _guildId: string, _note: TicketNote): Promise<void> {
  // no-op — notes are stored in the DB and surfaced via the dashboard
}

// ─── Webhook Helper ───────────────────────────────────────────────────────────

async function fireWebhook(url: string, payload: object): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
