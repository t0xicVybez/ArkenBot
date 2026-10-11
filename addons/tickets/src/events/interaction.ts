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
import { resolvePanelFields } from '../utils/fields.js';
import { fireWebhook } from '../utils/webhook.js';
// Lifecycle handlers live in ./handlers/lifecycle.js (P3 split).
import {
  handleCloseButton,
  handleClaimButton,
  handleUnclaimButton,
  handleReopenButton,
  handleKeepOpenButton,
  handleConfirmCloseButton,
  handleTranscriptButton,
  updateControlsMessage,
  finalizeTicketClose,
} from '../handlers/lifecycle.js';
export { closeTicket, updateControlsMessage } from '../handlers/lifecycle.js';
export { resolvePanelFields } from '../utils/fields.js';
// AI triage subsystem lives in ./handlers/triage.js (P3 split). Import what the
// router/createTicket use internally; re-export the full public surface so
// existing importers of this module are unaffected.
import {
  runTriageModel,
  getUserTicketHistory,
  handleAiAction,
  sendClaimBrief,
  sendAssignmentBrief,
} from '../handlers/triage.js';
export {
  generateTriage,
  runTriageModel,
  getUserTicketHistory,
  freshTriage,
  buildTriageEmbed,
  buildTriageActions,
  sendClaimBrief,
  sendAssignmentBrief,
} from '../handlers/triage.js';

const CUSTOM_ID_PREFIX = 'ticket:';

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
  await finalizeTicketClose(ctx, guildId, channelId, closeAction, logChannelId, panel ?? null, config.webhookUrl).catch((err: unknown) =>
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

