import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { Ticket, TicketPanel } from '../types.js';

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

// ─── Panel Embed ──────────────────────────────────────────────────────────────

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
 * Build action row(s) for the panel message.
 * Multi-button panels are grouped into rows of ≤5.
 */
export function buildPanelButtons(panel: TicketPanel): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = panel.buttons && panel.buttons.length > 0 ? panel.buttons : null;

  if (!buttons) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:open:${panel.id}`)
      .setLabel(panel.buttonLabel)
      .setStyle(toButtonStyle(panel.buttonColor));
    if (panel.emoji) { try { btn.setEmoji(panel.emoji); } catch { /* ignore */ } }
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
        if (b.emoji) { try { btn.setEmoji(b.emoji); } catch { /* ignore */ } }
        return btn;
      }),
    );
    rows.push(row);
  }
  return rows;
}

// ─── Ticket Open Embed ────────────────────────────────────────────────────────

export function buildTicketEmbed(ticket: Ticket, panel: TicketPanel, member: GuildMember): EmbedBuilder {
  const fields = [
    { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
    { name: 'Ticket #', value: `#${ticket.number}`, inline: true },
    { name: 'Priority', value: `${PRIORITY_EMOJI[ticket.priority]} ${capitalize(ticket.priority)}`, inline: true },
  ];

  if (ticket.categoryTag) fields.push({ name: 'Category', value: ticket.categoryTag, inline: true });

  // Show form responses with their field labels, falling back to a plain Reason field
  if (ticket.formResponses && panel.fields && panel.fields.length > 0) {
    for (const f of panel.fields) {
      const answer = ticket.formResponses[f.id];
      if (answer) fields.push({ name: f.label, value: answer, inline: false });
    }
  } else if (ticket.reason) {
    fields.push({ name: 'Reason', value: ticket.reason, inline: false });
  }

  return new EmbedBuilder()
    .setColor(COLORS.OPEN)
    .setTitle(`Ticket #${ticket.number}`)
    .setDescription(
      panel.welcomeMessage
        .replace('{user}', `<@${ticket.userId}>`)
        .replace('{username}', member.displayName)
        .replace('{number}', String(ticket.number)),
    )
    .addFields(fields)
    .setFooter({ text: `Panel: ${panel.name}` })
    .setTimestamp(new Date(ticket.createdAt));
}

export function buildTicketControls(channelId: string, waiting = false): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:claim:${channelId}`).setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket:close:${channelId}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:transcript:${channelId}`).setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket:waiting:${channelId}`)
        .setLabel(waiting ? 'Mark Active' : 'Waiting')
        .setEmoji(waiting ? '🔄' : '⏳')
        .setStyle(waiting ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  ];
}

export function buildClaimedControls(channelId: string, waiting = false): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:unclaim:${channelId}`).setLabel('Unclaim').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket:close:${channelId}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:transcript:${channelId}`).setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket:waiting:${channelId}`)
        .setLabel(waiting ? 'Mark Active' : 'Waiting')
        .setEmoji(waiting ? '🔄' : '⏳')
        .setStyle(waiting ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  ];
}

// ─── Ticket Closed / Rating / Transcript embeds ───────────────────────────────

export function buildClosedEmbed(ticket: Ticket, closedByTag: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.CLOSED)
    .setTitle(`🔒 Ticket #${ticket.number} Closed`)
    .addFields(
      { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Closed by', value: closedByTag, inline: true },
      { name: 'Duration', value: getDuration(ticket.createdAt, ticket.closedAt ?? new Date().toISOString()), inline: true },
    )
    .setTimestamp();
}

export function buildRatingEmbed(ticket: Ticket): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.RATING)
    .setTitle('How was your support experience?')
    .setDescription(`Your ticket **#${ticket.number}** has been closed.\nPlease rate your experience to help us improve!`);
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

export function buildTranscriptEmbed(ticket: Ticket, messageCount: number): EmbedBuilder {
  const fields = [
    { name: 'User', value: `<@${ticket.userId}> (${ticket.username})`, inline: true },
    { name: 'Ticket #', value: `#${ticket.number}`, inline: true },
    { name: 'Messages', value: String(messageCount), inline: true },
    { name: 'Status', value: capitalize(ticket.status), inline: true },
    { name: 'Priority', value: `${PRIORITY_EMOJI[ticket.priority]} ${capitalize(ticket.priority)}`, inline: true },
  ];
  if (ticket.categoryTag) fields.push({ name: 'Category', value: ticket.categoryTag, inline: true });
  if (ticket.claimedByTag) fields.push({ name: 'Claimed by', value: ticket.claimedByTag, inline: true });
  if (ticket.rating) fields.push({ name: 'Rating', value: '⭐'.repeat(ticket.rating), inline: true });

  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📄 Transcript — Ticket #${ticket.number}`)
    .addFields(fields)
    .setTimestamp(ticket.closedAt ? new Date(ticket.closedAt) : undefined);
}

export function buildInfoEmbed(ticket: Ticket, panel: TicketPanel): EmbedBuilder {
  const statusColor = { open: COLORS.OPEN, claimed: COLORS.CLAIMED, closed: COLORS.CLOSED, waiting: COLORS.WAITING }[ticket.status] ?? COLORS.INFO;
  const fields = [
    { name: 'Status', value: capitalize(ticket.status), inline: true },
    { name: 'Priority', value: `${PRIORITY_EMOJI[ticket.priority]} ${capitalize(ticket.priority)}`, inline: true },
    { name: 'Panel', value: panel.name, inline: true },
    { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
  ];
  if (ticket.categoryTag) fields.push({ name: 'Category', value: ticket.categoryTag, inline: true });
  if (ticket.claimedByTag) fields.push({ name: 'Claimed by', value: ticket.claimedByTag, inline: true });
  if (ticket.tags.length > 0) fields.push({ name: 'Tags', value: ticket.tags.join(', '), inline: false });
  if (ticket.notes.length > 0) fields.push({ name: 'Staff Notes', value: String(ticket.notes.length), inline: true });
  if (ticket.reason) fields.push({ name: 'Reason', value: ticket.reason, inline: false });

  return new EmbedBuilder()
    .setColor(statusColor)
    .setTitle(`Ticket #${ticket.number} — Info`)
    .addFields(fields)
    .setTimestamp(new Date(ticket.createdAt));
}

export function buildReopenButton(channelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:reopen:${channelId}`)
      .setLabel('Reopen')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
