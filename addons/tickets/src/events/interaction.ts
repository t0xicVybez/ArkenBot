import {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Interaction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type Guild,
  type Message,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { jsonCompletion, isLLMAvailable, LLMUnavailableError } from '@arkenbot/shared';
import type { Ticket, TicketPanel, TicketNote, PanelField, TicketPriority, AiTriage } from '../types.js';
import {
  getPanel,
  getConfig,
  saveConfig,
  getUserOpenTickets,
  getTickets,
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
  type Translate,
} from '../utils/embeds.js';
import { createTicketChannel, archiveTicketChannel, restoreTicketChannel, resolveChannelName } from '../utils/channel.js';
import { generateTranscriptHtml } from '../utils/transcript.js';
import { isWithinBusinessHours } from '../utils/time.js';

const CUSTOM_ID_PREFIX = 'ticket:';

/**
 * Returns the form questions to show for a ticket opened via `buttonId`.
 * A button's own `fields` take precedence (letting each ticket type ask its own
 * questions); otherwise the panel-level `fields` apply as the shared default.
 */
export function resolvePanelFields(panel: TicketPanel, buttonId?: string): PanelField[] {
  const button = buttonId ? panel.buttons?.find((b) => b.id === buttonId) : undefined;
  if (button?.fields && button.fields.length > 0) return button.fields;
  return panel.fields ?? [];
}

/**
 * Pending close timers keyed by channelId.
 * Used to cancel the fallback timer when the user submits their rating.
 */
const pendingClose = new Map<string, ReturnType<typeof setTimeout>>();

export function isTicketInteraction(interaction: Interaction): boolean {
  if (interaction.isButton()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  if (interaction.isStringSelectMenu()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  if (interaction.isModalSubmit()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  return false;
}

export async function handleTicketInteraction(
  ctx: AddonContext,
  interaction: Interaction,
): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(ctx, interaction);
  } else if (interaction.isStringSelectMenu()) {
    await handleSelect(ctx, interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModal(ctx, interaction);
  }
}

// ─── Select-Menu Handler (dropdown-style panels) ───────────────────────────────

async function handleSelect(ctx: AddonContext, interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId;
  if (id.startsWith('ticket:select:')) {
    // Format: ticket:select:{panelId}, selected value = the button id
    const panelId = id.slice('ticket:select:'.length);
    const buttonId = interaction.values[0];
    await handleOpenTicket(ctx, interaction, panelId, buttonId);
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
  } else if (id.startsWith('ticket:ai:')) {
    await handleAiAction(ctx, interaction, id);
  } else if (id.startsWith('ticket:keepopen:')) {
    const channelId = id.slice('ticket:keepopen:'.length);
    await handleKeepOpenButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:confirmclose:')) {
    const channelId = id.slice('ticket:confirmclose:'.length);
    await handleConfirmCloseButton(ctx, interaction, channelId);
  }
}

// ─── Open Ticket ──────────────────────────────────────────────────────────────

async function handleOpenTicket(
  ctx: AddonContext,
  interaction: ButtonInteraction | StringSelectMenuInteraction,
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

  // Account-age gate
  if (config.minAccountAgeDays && config.minAccountAgeDays > 0) {
    const ageMs = Date.now() - interaction.user.createdTimestamp;
    if (ageMs < config.minAccountAgeDays * 86400000) {
      await interaction.reply({ content: t('accountTooNew', { days: config.minAccountAgeDays }), flags: MessageFlags.Ephemeral });
      return;
    }
  }

  // Required-role gate
  if (config.requiredOpenRoleId) {
    const m = interaction.guild.members.cache.get(interaction.user.id)
      ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!m?.roles.cache.has(config.requiredOpenRoleId)) {
      await interaction.reply({ content: t('needRoleToOpen', { role: `<@&${config.requiredOpenRoleId}>` }), flags: MessageFlags.Ephemeral });
      return;
    }
  }

  // Open cooldown (based on the user's most recent ticket in this guild)
  if (config.openCooldownMinutes && config.openCooldownMinutes > 0) {
    const mine = (await getTickets(ctx.storage, guildId))
      .filter((x) => x.userId === interaction.user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const last = mine[0];
    if (last) {
      const cdMs = config.openCooldownMinutes * 60000;
      const sinceMs = Date.now() - new Date(last.createdAt).getTime();
      if (sinceMs < cdMs) {
        const readyAt = Math.floor((new Date(last.createdAt).getTime() + cdMs) / 1000);
        await interaction.reply({ content: t('openCooldown', { when: `<t:${readyAt}:R>` }), flags: MessageFlags.Ephemeral });
        return;
      }
    }
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

  // Resolve category tag + fields from the clicked button (per-button fields
  // override the panel-level fields; see resolvePanelFields).
  const clickedBtn = buttonId ? panel.buttons?.find((b) => b.id === buttonId) : undefined;
  const categoryTag = clickedBtn?.categoryTag;
  const formFields = resolvePanelFields(panel, buttonId);

  if (formFields.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket:reason:${panelId}${buttonId ? `:${buttonId}` : ''}`)
      .setTitle((clickedBtn?.label?.trim() || t('modalOpenTitle')).slice(0, 45));
    const fieldRows = formFields.slice(0, 5).map((f) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          // Discord requires a 1–45 char label; guard empty/over-long values.
          .setLabel((f.label?.trim() || 'Response').slice(0, 45))
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
    await createTicket(ctx, interaction.guild, interaction.user.id, interaction.user.tag, panel, undefined, interaction, categoryTag, undefined, buttonId);
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
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  categoryTag?: string,
  formResponses?: Record<string, string>,
  buttonId?: string,
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
  const channelName = resolveChannelName(panel, number, member.displayName, categoryTag);

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
    buttonId,
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

  const config = await getConfig(ctx.storage, guildId);

  // ── User history (staff context) ──
  let historyLine = '';
  if (config.showUserHistory) {
    const hist = await getUserTicketHistory(ctx, guildId, userId, ticket.id);
    if (hist.count > 0) {
      historyLine = t('historyLine', { count: hist.count, rating: hist.avgRating != null ? `${hist.avgRating.toFixed(1)}★` : '—' });
    }
  }

  // ── AI auto-triage on open ──
  if (config.autoTriage && isLLMAvailable()) {
    try {
      const triage = await runTriageModel(ctx, ticket, channel, !!config.autoTriageTag);
      if (triage) {
        ticket.aiTriage = triage;
        if (config.autoTriageSetPriority && ['low', 'medium', 'high'].includes(triage.urgency)) {
          ticket.priority = triage.urgency as TicketPriority;
        }
        if (config.autoTriageTag && triage.tag && !ticket.tags.includes(triage.tag)) {
          ticket.tags.push(triage.tag);
        }
        ticket.notes.push({
          id: randomUUID(),
          authorId: ctx.client.user!.id,
          authorTag: 'AI Triage',
          content: `🧠 ${triage.summary}${triage.reply ? `\n\n💬 ${triage.reply}` : ''}`,
          createdAt: new Date().toISOString(),
        });
        await saveTicket(ctx.storage, guildId, ticket);
      }
    } catch (err) {
      ctx.logger.warn(`Auto-triage failed for #${ticket.number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Business-hours away notice
  if (config.businessHours?.enabled && config.businessHours.awayMessage && !isWithinBusinessHours(config.businessHours, Date.now())) {
    await channel.send(config.businessHours.awayMessage).catch(() => null);
  }

  // Fire webhook
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
      const notifyFields = resolvePanelFields(panel, buttonId);
      if (formResponses && notifyFields.length > 0) {
        formSummary = notifyFields
          .filter((f) => formResponses![f.id])
          .map((f) => `> **${f.label}:** ${formResponses![f.id]}`)
          .join('\n');
      } else if (reason) {
        formSummary = `> ${reason}`;
      }
      const aiLine = ticket.aiTriage ? `\n🧠 ${ticket.aiTriage.summary}` : '';
      const histLine = historyLine ? `\n${historyLine}` : '';
      await notifyChannel.send(
        `${rolePing}📬 New ticket **#${ticket.number}** opened by <@${userId}>${ticket.categoryTag ? ` — \`${ticket.categoryTag}\`` : ''}${formSummary ? `\n${formSummary}` : ''}${aiLine}${histLine}\n→ <#${channel.id}>`,
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
          await sendAssignmentBrief(ctx, ticket, assignee, t, false);
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
  await sendClaimBrief(ctx, interaction, ticket, t);
}

/**
 * After a staff member claims a ticket, privately send them the AI triage brief
 * (summary + suggested reply + action buttons) so they don't have to run
 * `/ticket notes`. Ephemeral — only the claimer sees it. No-op when there's no
 * AI triage (e.g. auto-triage disabled or no AI key).
 */
export async function sendClaimBrief(
  ctx: AddonContext,
  interaction: ButtonInteraction | import('discord.js').ChatInputCommandInteraction,
  ticket: Ticket,
  t: Translate,
): Promise<void> {
  // Smart-refresh: reuse the cached brief unless the conversation has advanced
  // since it was made (then regenerate so the claimer sees current context).
  const triage = await freshTriage(ctx, ticket, false);
  if (!triage) return;
  await interaction.followUp({
    content: t('claimBriefHeader', { num: ticket.number }),
    embeds: [buildTriageEmbed(ticket, triage, t)],
    components: [buildTriageActions(ticket.channelId, t)],
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
}

/** Resolve the ticket's channel as something with a `messages.fetch`. */
function ticketMsgChannel(ctx: AddonContext, ticket: Ticket): MsgFetchable | null {
  const ch = ctx.client.channels.cache.get(ticket.channelId);
  return ch && 'messages' in ch ? (ch as unknown as MsgFetchable) : null;
}

/**
 * Return an up-to-date triage for a ticket: regenerate from the live
 * conversation when `force` is set, when there's no cached brief, or when a
 * message has arrived since the cached brief was made; otherwise reuse the
 * cache. Persists a regenerated brief onto the ticket. Falls back to the stale
 * cache if the AI is unavailable or regeneration fails.
 */
export async function freshTriage(
  ctx: AddonContext,
  ticket: Ticket,
  force: boolean,
): Promise<AiTriage | null> {
  const cached = ticket.aiTriage ?? null;
  let needRegen = force || !cached;
  if (!needRegen && cached) {
    const msgs = await getMessages(ctx.storage, ticket.channelId);
    const lastMsgAt = msgs.reduce((max, m) => Math.max(max, new Date(m.timestamp).getTime()), 0);
    if (lastMsgAt > new Date(cached.at).getTime()) needRegen = true;
  }
  if (!needRegen) return cached;
  if (!isLLMAvailable()) return cached; // can't regenerate — use stale if any
  try {
    const fresh = await runTriageModel(ctx, ticket, ticketMsgChannel(ctx, ticket), true);
    if (fresh) {
      ticket.aiTriage = fresh;
      await saveTicket(ctx.storage, ticket.guildId, ticket);
      return fresh;
    }
  } catch (err) {
    ctx.logger.warn(`Triage regenerate failed for #${ticket.number}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return cached;
}

/**
 * DM a staff member the ticket's AI brief when they're assigned it without
 * clicking anything — i.e. via `/ticket transfer` (force a regenerate so the
 * brief covers the whole conversation) or round-robin auto-assign on open
 * (the brief is already fresh, so `force` stays false). If the DM can't be
 * delivered, drop a quiet in-channel ping to `/triage` — never the private AI
 * content.
 */
export async function sendAssignmentBrief(
  ctx: AddonContext,
  ticket: Ticket,
  targetMember: import('discord.js').GuildMember,
  t: Translate,
  force = false,
): Promise<void> {
  const triage = await freshTriage(ctx, ticket, force);
  if (!triage) return;
  const guildName = ctx.getGuild(ticket.guildId)?.name ?? '';
  const dmOk = await targetMember.send({
    content: t('transferBriefHeader', { num: ticket.number, guild: guildName, channel: `<#${ticket.channelId}>` }),
    embeds: [buildTriageEmbed(ticket, triage, t)],
    components: [buildTriageActions(ticket.channelId, t)],
  }).then(() => true).catch(() => false);
  if (!dmOk) {
    const ch = ctx.client.channels.cache.get(ticket.channelId) as TextChannel | undefined;
    if (ch && 'send' in ch) await ch.send(t('transferBriefFallback', { user: `<@${targetMember.id}>`, num: ticket.number })).catch(() => null);
  }
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

  const channel = interaction.channel;
  let triage: AiTriage | null;
  try {
    triage = await runTriageModel(ctx, ticket, channel && 'messages' in channel ? channel : null, true);
  } catch (err) {
    if (err instanceof LLMUnavailableError) {
      await interaction.editReply(t('aiUnavailable'));
      return;
    }
    ctx.logger.warn(`Ticket AI triage failed: ${err instanceof Error ? err.message : String(err)}`);
    await interaction.editReply(t('aiError'));
    return;
  }

  if (!triage) {
    await interaction.editReply(t('aiNothing'));
    return;
  }

  // Cache on the ticket so the action buttons can act without re-calling the model.
  ticket.aiTriage = triage;
  await saveTicket(ctx.storage, interaction.guildId, ticket);

  await interaction.editReply({
    embeds: [buildTriageEmbed(ticket, triage, t)],
    components: [buildTriageActions(ticket.channelId, t)],
  });
}

// ─── AI triage helpers (shared by /triage and auto-triage-on-open) ─────────────

type MsgFetchable = { messages: { fetch: (o: { limit: number }) => Promise<Map<string, Message>> } };

/** Model used for ticket triage — bigger/smarter, on its own Groq token budget. */
const TRIAGE_MODEL = 'openai/gpt-oss-120b';

/** Call the LLM to summarize a ticket. Returns null when there's nothing to triage. */
export async function runTriageModel(
  ctx: AddonContext,
  ticket: Ticket,
  channel: MsgFetchable | null,
  wantTag: boolean,
): Promise<AiTriage | null> {
  const details: string[] = [];
  if (ticket.reason) details.push(`Reason given: ${ticket.reason}`);
  // Map form-field IDs → their human question labels so the model sees the
  // actual questions, not internal UUIDs.
  const triagePanel = await getPanel(ctx.storage, ticket.guildId, ticket.panelId);
  const labelById = new Map((triagePanel ? resolvePanelFields(triagePanel, ticket.buttonId) : []).map((f) => [f.id, f.label]));
  for (const [k, v] of Object.entries(ticket.formResponses ?? {})) details.push(`${labelById.get(k) ?? k}: ${v}`);

  let transcript: string[] = [];
  if (channel) {
    try {
      // Keep the context tight: the most recent ~15 messages carry the current
      // state of the conversation, and fewer tokens per call means more daily
      // headroom on the model's token budget.
      const fetched = await channel.messages.fetch({ limit: 15 });
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
  if (!context) return null;

  const result = await jsonCompletion<{ summary?: string; urgency?: string; reply?: string; tag?: string }>(
    [
      {
        role: 'system',
        content:
          'You triage support tickets for staff. Given the ticket details and conversation, respond with a JSON object ' +
          `{"summary": string, "urgency": "low"|"medium"|"high", "reply": string${wantTag ? ', "tag": string' : ''}}. ` +
          '"summary" is 1-2 sentences describing the user\'s issue. "urgency" reflects how time-sensitive it is. ' +
          '"reply" is a friendly, helpful first response a staff member could send, ready to adapt. ' +
          (wantTag ? '"tag" is a single short lowercase category label (1-2 words). ' : '') +
          'Base everything only on the provided content; do not invent facts.',
      },
      { role: 'user', content: context },
    ],
    // Use the larger gpt-oss-120b for triage quality. Groq rate-limits per
    // model, so this runs on its own token budget, separate from other AI
    // features (which stay on the default model).
    { model: TRIAGE_MODEL, temperature: 0.3, maxTokens: 600 },
  );

  const urgency = (result.urgency ?? 'medium').toLowerCase();
  return {
    summary: (result.summary ?? '').slice(0, 1000),
    urgency: ['low', 'medium', 'high'].includes(urgency) ? urgency : 'medium',
    reply: result.reply ? result.reply.slice(0, 1500) : undefined,
    tag: wantTag && result.tag ? result.tag.toLowerCase().trim().slice(0, 30) : undefined,
    at: new Date().toISOString(),
  };
}

const URGENCY_META: Record<string, { emoji: string; color: number }> = {
  low: { emoji: '🟢', color: 0x57f287 },
  medium: { emoji: '🟡', color: 0xfee75c },
  high: { emoji: '🔴', color: 0xed4245 },
};

export function buildTriageEmbed(ticket: Ticket, triage: AiTriage, t: Translate): EmbedBuilder {
  const meta = URGENCY_META[triage.urgency] ?? URGENCY_META.medium;
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(t('aiTriageTitle', { num: ticket.number }))
    .addFields(
      { name: t('aiFieldSummary'), value: (triage.summary || '—').slice(0, 1024) },
      { name: t('aiFieldUrgency'), value: `${meta.emoji} ${t('priority' + triage.urgency.charAt(0).toUpperCase() + triage.urgency.slice(1))}`, inline: true },
    );
  if (triage.tag) embed.addFields({ name: t('aiFieldTag'), value: `\`${triage.tag}\``, inline: true });
  embed.addFields({ name: t('aiFieldReply'), value: (triage.reply || '—').slice(0, 1024) });
  return embed.setFooter({ text: t('aiFooter') }).setTimestamp();
}

export function buildTriageActions(channelId: string, t: Translate): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:ai:priority:${channelId}`).setLabel(t('aiBtnSetPriority')).setEmoji('⚡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:ai:reply:${channelId}`).setLabel(t('aiBtnPostReply')).setEmoji('✉️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:ai:note:${channelId}`).setLabel(t('aiBtnSaveNote')).setEmoji('📝').setStyle(ButtonStyle.Secondary),
  );
}

/** Count a user's prior tickets in this guild and their average rating. */
export async function getUserTicketHistory(
  ctx: AddonContext,
  guildId: string,
  userId: string,
  excludeId: string,
): Promise<{ count: number; avgRating: number | null }> {
  const all = await getTickets(ctx.storage, guildId);
  const prior = all.filter((x) => x.userId === userId && x.id !== excludeId);
  const rated = prior.filter((x) => typeof x.rating === 'number');
  const avgRating = rated.length ? rated.reduce((s, x) => s + (x.rating ?? 0), 0) / rated.length : null;
  return { count: prior.length, avgRating };
}

/** Handle the AI action buttons (Set priority / Post reply / Save as note). */
async function handleAiAction(ctx: AddonContext, interaction: ButtonInteraction, id: string): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const parts = id.split(':'); // ticket:ai:{action}:{channelId}
  const action = parts[2];
  const channelId = parts.slice(3).join(':');

  const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }
  const panel = await getPanel(ctx.storage, guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = !panel || panel.staffRoles.length === 0 || panel.staffRoles.some((r) => member?.roles.cache.has(r));
  if (!isStaff) {
    await interaction.reply({ content: t('aiOnlyStaff'), flags: MessageFlags.Ephemeral });
    return;
  }
  const triage = ticket.aiTriage;
  if (!triage) {
    await interaction.reply({ content: t('aiNothing'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'priority') {
    const level = (['low', 'medium', 'high'].includes(triage.urgency) ? triage.urgency : 'medium') as TicketPriority;
    ticket.priority = level;
    await saveTicket(ctx.storage, guildId, ticket);
    await interaction.reply({ content: t('aiPrioritySet', { level: t('priority' + level.charAt(0).toUpperCase() + level.slice(1)) }), flags: MessageFlags.Ephemeral });
  } else if (action === 'reply') {
    if (!triage.reply) {
      await interaction.reply({ content: t('aiNothing'), flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = ctx.client.channels.cache.get(channelId) as TextChannel | undefined;
    if (channel && 'send' in channel) await channel.send(triage.reply).catch(() => null);
    if (!ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date().toISOString();
      await saveTicket(ctx.storage, guildId, ticket);
    }
    await interaction.reply({ content: t('aiReplyPosted'), flags: MessageFlags.Ephemeral });
  } else if (action === 'note') {
    ticket.notes.push({
      id: randomUUID(),
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      content: `🧠 ${triage.summary}${triage.reply ? `\n\n💬 ${triage.reply}` : ''}`,
      createdAt: new Date().toISOString(),
    });
    await saveTicket(ctx.storage, guildId, ticket);
    await interaction.reply({ content: t('aiNoteSaved'), flags: MessageFlags.Ephemeral });
  }
}

// ─── Keep-open (pre-close nudge + close request) ───────────────────────────────

async function handleKeepOpenButton(ctx: AddonContext, interaction: ButtonInteraction, channelId: string): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }
  // Reset the inactivity timer and clear any pending nudge / close request.
  ticket.lastActivity = new Date().toISOString();
  ticket.nudgedAt = undefined;
  ticket.closeRequestedBy = undefined;
  ticket.closeRequestedByTag = undefined;
  ticket.closeRequestedAt = undefined;
  await saveTicket(ctx.storage, interaction.guildId, ticket);
  await interaction.reply({ content: t('keptOpen', { user: `<@${interaction.user.id}>` }) });
}

async function handleConfirmCloseButton(ctx: AddonContext, interaction: ButtonInteraction, channelId: string): Promise<void> {
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
  const isStaff = !panel || panel.staffRoles.length === 0 || panel.staffRoles.some((r) => member?.roles.cache.has(r));
  const isOpener = interaction.user.id === ticket.userId;
  if (!isOpener && !isStaff) {
    await interaction.reply({ content: t('onlyOpenerOrStaffClose'), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  await closeTicket(ctx, interaction, ticket, t('closedViaRequest'));
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

  // Low-rating alert — ping staff when CSAT is at or below the threshold.
  if (config.lowRatingThreshold && config.lowRatingThreshold > 0 && rating <= config.lowRatingThreshold) {
    const alertChannelId = config.lowRatingAlertChannelId || config.staffNotifyChannelId;
    const guild = ctx.getGuild(guildId);
    const alertChannel = alertChannelId ? (guild?.channels.cache.get(alertChannelId) as TextChannel | undefined) : undefined;
    if (alertChannel && 'send' in alertChannel) {
      const staffLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: guild?.preferredLocale });
      const st = (k: string, v?: Record<string, string | number>) => ctx.t(k, staffLoc, v);
      const rolePing = config.lowRatingAlertRoleId ? `<@&${config.lowRatingAlertRoleId}> ` : '';
      await alertChannel.send(
        `${rolePing}${st('lowRatingAlert', { num: ticket.number, stars: '⭐'.repeat(rating), user: `<@${ticket.userId}>`, handler: ticket.claimedByTag || ticket.closedByTag || '—' })}${feedback ? `\n> ${feedback}` : ''}`,
      ).catch(() => null);
    }
  }

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
  const submitFields = resolvePanelFields(panel, buttonId);

  let reason: string | undefined;
  let formResponses: Record<string, string> | undefined;

  if (submitFields.length > 0) {
    formResponses = {};
    for (const field of submitFields) {
      try {
        const val = interaction.fields.getTextInputValue(field.id).trim();
        if (val) formResponses[field.id] = val;
      } catch {
        // field not present
      }
    }
    const firstTextField = submitFields[0];
    if (firstTextField && formResponses[firstTextField.id]) {
      reason = formResponses[firstTextField.id];
    }
  } else {
    reason = interaction.fields.getTextInputValue('reason').trim();
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await createTicket(ctx, interaction.guild, interaction.user.id, interaction.user.tag, panel, reason, interaction, categoryTag, formResponses, buttonId);
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
