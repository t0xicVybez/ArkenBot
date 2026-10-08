import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { Ticket, TicketPanel } from '../types.js';

/** Translator bound to the viewer's locale, passed in from the addon context. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const COLORS = {
  OPEN: 0x57f287,
  CLAIMED: 0x5865f2,
  CLOSED: 0xed4245,
  WAITING: 0xfee75c,
  INFO: 0x99aab5,
  RATING: 0xfee75c,
} as const;

const PRIORITY_EMOJI: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  urgent: '🔴',
};

/** Localized display label for a ticket status / priority enum value. */
function statusLabel(t: Translate, status: string): string {
  return t('status' + status.charAt(0).toUpperCase() + status.slice(1));
}
function priorityLabel(t: Translate, priority: string): string {
  return t('priority' + priority.charAt(0).toUpperCase() + priority.slice(1));
}

function parseColor(hex?: string): number {
  if (!hex) return 0x5865f2;
  const n = parseInt(hex.replace('#', ''), 16);
  return isNaN(n) ? 0x5865f2 : n;
}

function toButtonStyle(color: string): ButtonStyle {
  return (
    { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger }[color] ??
    ButtonStyle.Primary
  );
}

// ─── Panel Embed (author-configured text — not translated) ────────────────────

export function buildPanelEmbed(panel: TicketPanel, guild: Guild): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(parseColor(panel.embedColor))
    .setTitle(panel.name)
    .setDescription(panel.description)
    .setTimestamp();

  if (panel.embedAuthorName) {
    embed.setAuthor({ name: panel.embedAuthorName, iconURL: panel.embedAuthorIconUrl || undefined });
  }
  if (panel.embedThumbnailUrl) embed.setThumbnail(panel.embedThumbnailUrl);
  if (panel.embedImageUrl) embed.setImage(panel.embedImageUrl);

  embed.setFooter({
    text: panel.embedFooterText ?? guild.name,
    iconURL: panel.embedFooterIconUrl || guild.iconURL() || undefined,
  });

  return embed;
}

/**
 * Extract a Discord-valid emoji from a free-text field. Users sometimes type an
 * emoji plus extra words (e.g. "🎫 feedback") into the emoji box, which Discord
 * rejects with COMPONENT_INVALID_EMOJI and fails the *entire* panel send. This
 * returns a usable emoji — a custom token `<:name:id>`, a country flag, or the
 * leading unicode emoji — or undefined so we simply omit it rather than crash.
 */
function pickEmoji(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(s)) return s; // custom emoji token
  const flag = s.match(/\p{Regional_Indicator}\p{Regional_Indicator}/u);
  if (flag) return flag[0]; // country flag (pair of regional indicators)
  const emoji = s.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u);
  if (emoji) return emoji[0]; // first unicode emoji sequence, trailing text dropped
  return undefined;
}

/** Set a button's emoji only when the raw value yields a valid one. */
function applyEmoji(btn: ButtonBuilder, raw?: string): void {
  const e = pickEmoji(raw);
  if (e) { try { btn.setEmoji(e); } catch { /* malformed — leave emoji off */ } }
}

export function buildPanelButtons(panel: TicketPanel): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = panel.buttons && panel.buttons.length > 0 ? panel.buttons : null;

  if (!buttons) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:open:${panel.id}`)
      .setLabel(panel.buttonLabel)
      .setStyle(toButtonStyle(panel.buttonColor));
    applyEmoji(btn, panel.emoji);
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)];
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(buttons.length, 25); i += 5) {
    const chunk = buttons.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      chunk.map((b) => {
        const btn = new ButtonBuilder()
          .setCustomId(`ticket:open:${panel.id}:${b.id}`)
          .setLabel(b.label)
          .setStyle(toButtonStyle(b.color));
        applyEmoji(btn, b.emoji);
        return btn;
      }),
    );
    rows.push(row);
  }
  return rows;
}

// ─── Ticket Open Embed ────────────────────────────────────────────────────────

export function buildTicketEmbed(ticket: Ticket, panel: TicketPanel, member: GuildMember, t: Translate): EmbedBuilder {
  const fields = [
    { name: t('fieldOpenedBy'), value: `<@${ticket.userId}>`, inline: true },
    { name: t('fieldTicketNum'), value: `#${ticket.number}`, inline: true },
    { name: t('fieldPriority'), value: `${PRIORITY_EMOJI[ticket.priority]} ${priorityLabel(t, ticket.priority)}`, inline: true },
  ];

  if (ticket.categoryTag) fields.push({ name: t('fieldCategory'), value: ticket.categoryTag, inline: true });

  // Use the clicked button's own fields when it defines them, else the panel's.
  const btn = ticket.buttonId ? panel.buttons?.find((b) => b.id === ticket.buttonId) : undefined;
  const formFields = (btn?.fields && btn.fields.length > 0) ? btn.fields : (panel.fields ?? []);
  if (ticket.formResponses && formFields.length > 0) {
    for (const f of formFields) {
      const answer = ticket.formResponses[f.id];
      if (answer) fields.push({ name: f.label, value: answer, inline: false });
    }
  } else if (ticket.reason) {
    fields.push({ name: t('fieldReason'), value: ticket.reason, inline: false });
  }

  return new EmbedBuilder()
    .setColor(COLORS.OPEN)
    .setTitle(t('ticketTitle', { num: ticket.number }))
    .setDescription(
      panel.welcomeMessage
        .replace('{user}', `<@${ticket.userId}>`)
        .replace('{username}', member.displayName)
        .replace('{number}', String(ticket.number)),
    )
    .addFields(fields)
    .setFooter({ text: t('ticketFooter', { name: panel.name }) })
    .setTimestamp(new Date(ticket.createdAt));
}

export function buildTicketControls(channelId: string, t: Translate, waiting = false): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:claim:${channelId}`).setLabel(t('btnClaim')).setEmoji('🙋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket:close:${channelId}`).setLabel(t('btnClose')).setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:transcript:${channelId}`).setLabel(t('btnTranscript')).setEmoji('📄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket:waiting:${channelId}`)
        .setLabel(waiting ? t('btnMarkActive') : t('btnWaiting'))
        .setEmoji(waiting ? '🔄' : '⏳')
        .setStyle(waiting ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  ];
}

export function buildClaimedControls(channelId: string, t: Translate, waiting = false): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:unclaim:${channelId}`).setLabel(t('btnUnclaim')).setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket:close:${channelId}`).setLabel(t('btnClose')).setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:transcript:${channelId}`).setLabel(t('btnTranscript')).setEmoji('📄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket:waiting:${channelId}`)
        .setLabel(waiting ? t('btnMarkActive') : t('btnWaiting'))
        .setEmoji(waiting ? '🔄' : '⏳')
        .setStyle(waiting ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  ];
}

// ─── Ticket Closed / Rating / Transcript embeds ───────────────────────────────

export function buildClosedEmbed(ticket: Ticket, closedByTag: string, t: Translate): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.CLOSED)
    .setTitle(t('closedTitle', { num: ticket.number }))
    .addFields(
      { name: t('fieldOpenedBy'), value: `<@${ticket.userId}>`, inline: true },
      { name: t('fieldClosedBy'), value: closedByTag, inline: true },
      { name: t('fieldDuration'), value: getDuration(ticket.createdAt, ticket.closedAt ?? new Date().toISOString()), inline: true },
    )
    .setTimestamp();
}

export function buildRatingEmbed(ticket: Ticket, t: Translate): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.RATING)
    .setTitle(t('ratingTitle'))
    .setDescription(t('ratingDesc', { num: ticket.number }));
}

export function buildRatingButtons(guildId: string, channelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`ticket:rate:${guildId}:${channelId}:${n}`)
        .setLabel(['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'][n - 1])
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

export function buildTranscriptEmbed(ticket: Ticket, messageCount: number, t: Translate): EmbedBuilder {
  const fields = [
    { name: t('fieldUser'), value: `<@${ticket.userId}> (${ticket.username})`, inline: true },
    { name: t('fieldTicketNum'), value: `#${ticket.number}`, inline: true },
    { name: t('fieldMessages'), value: String(messageCount), inline: true },
    { name: t('fieldStatus'), value: statusLabel(t, ticket.status), inline: true },
    { name: t('fieldPriority'), value: `${PRIORITY_EMOJI[ticket.priority]} ${priorityLabel(t, ticket.priority)}`, inline: true },
  ];
  if (ticket.categoryTag) fields.push({ name: t('fieldCategory'), value: ticket.categoryTag, inline: true });
  if (ticket.claimedByTag) fields.push({ name: t('fieldClaimedBy'), value: ticket.claimedByTag, inline: true });
  if (ticket.rating) fields.push({ name: t('fieldRating'), value: '⭐'.repeat(ticket.rating), inline: true });

  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(t('transcriptTitle', { num: ticket.number }))
    .addFields(fields)
    .setTimestamp(ticket.closedAt ? new Date(ticket.closedAt) : undefined);
}

export function buildInfoEmbed(ticket: Ticket, panel: TicketPanel, t: Translate): EmbedBuilder {
  const statusColor = { open: COLORS.OPEN, claimed: COLORS.CLAIMED, closed: COLORS.CLOSED, waiting: COLORS.WAITING }[ticket.status] ?? COLORS.INFO;
  const fields = [
    { name: t('fieldStatus'), value: statusLabel(t, ticket.status), inline: true },
    { name: t('fieldPriority'), value: `${PRIORITY_EMOJI[ticket.priority]} ${priorityLabel(t, ticket.priority)}`, inline: true },
    { name: t('fieldPanel'), value: panel.name, inline: true },
    { name: t('fieldOpenedBy'), value: `<@${ticket.userId}>`, inline: true },
  ];
  if (ticket.categoryTag) fields.push({ name: t('fieldCategory'), value: ticket.categoryTag, inline: true });
  if (ticket.claimedByTag) fields.push({ name: t('fieldClaimedBy'), value: ticket.claimedByTag, inline: true });
  if (ticket.tags.length > 0) fields.push({ name: t('fieldTags'), value: ticket.tags.join(', '), inline: false });
  if (ticket.notes.length > 0) fields.push({ name: t('fieldStaffNotes'), value: String(ticket.notes.length), inline: true });
  if (ticket.reason) fields.push({ name: t('fieldReason'), value: ticket.reason, inline: false });

  return new EmbedBuilder()
    .setColor(statusColor)
    .setTitle(t('infoTitle', { num: ticket.number }))
    .addFields(fields)
    .setTimestamp(new Date(ticket.createdAt));
}

export function buildReopenButton(channelId: string, t: Translate): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:reopen:${channelId}`)
      .setLabel(t('btnReopen'))
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
