/**
 * AI triage subsystem for the Tickets addon — the on-demand /triage, the
 * auto-triage on open, the smart-refresh on claim, and the DM brief on
 * transfer/auto-assign, plus the triage action buttons. Extracted from
 * events/interaction.ts (P3 god-file split); public surface unchanged
 * (re-exported from interaction.ts).
 */
import {
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type TextChannel,
  type GuildMember,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { jsonCompletion, isLLMAvailable, LLMUnavailableError } from '@arkenbot/shared';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Ticket, AiTriage, TicketPriority } from '../types.js';
import { getPanel, getTicketByChannel, saveTicket, getMessages, getTickets } from '../utils/storage.js';
import { resolvePanelFields } from '../utils/fields.js';
import type { Translate } from '../utils/embeds.js';

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
export async function handleAiAction(ctx: AddonContext, interaction: ButtonInteraction, id: string): Promise<void> {
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

