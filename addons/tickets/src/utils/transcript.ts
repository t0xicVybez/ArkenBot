/**
 * transcript helpers for the tickets addon.
 * The HTML builder itself lives in @arkenbot/shared (buildTicketTranscriptHtml)
 * so the bot and the API dashboard-download route share one implementation
 * instead of two independently-maintained copies.
 */
import { buildTicketTranscriptHtml } from '@arkenbot/shared';
import type { Ticket, TicketPanel, TicketMessage } from '../types.js';
import type { Translate } from './embeds.js';

export function generateTranscriptHtml(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  t: Translate,
  includeNotes = true,
): Buffer {
  const html = buildTicketTranscriptHtml(ticket, panel, messages, { t, includeNotes });
  return Buffer.from(html, 'utf-8');
}

export function generateTranscriptText(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  includeNotes: boolean,
): Buffer {
  const lines: string[] = [
    `=== TICKET #${ticket.number} TRANSCRIPT ===`,
    `Panel: ${panel.name}`,
    `Opened by: ${ticket.username} (${ticket.userId})`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    `Created: ${new Date(ticket.createdAt).toLocaleString()}`,
    ticket.closedAt ? `Closed: ${new Date(ticket.closedAt).toLocaleString()}` : '',
    ticket.reason ? `Reason: ${ticket.reason}` : '',
    ticket.rating ? `Rating: ${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)` : '',
    ticket.ratingFeedback ? `Feedback: ${ticket.ratingFeedback}` : '',
    '',
    '=== MESSAGES ===',
    '',
    ...messages.map((m) => `[${new Date(m.timestamp).toLocaleString()}] ${m.authorTag}: ${m.content}${m.attachments.length ? ` [${m.attachments.length} attachment(s)]` : ''}`),
  ];

  if (includeNotes && ticket.notes.length > 0) {
    lines.push('', '=== STAFF NOTES ===', '');
    for (const note of ticket.notes) {
      lines.push(`[${new Date(note.createdAt).toLocaleString()}] ${note.authorTag}: ${note.content}`);
    }
  }

  return Buffer.from(lines.filter((l) => l !== undefined).join('\n'), 'utf-8');
}

export function generateTranscriptJson(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  includeNotes: boolean,
): Buffer {
  const data = {
    ticket: {
      id: ticket.id,
      number: ticket.number,
      panel: panel.name,
      userId: ticket.userId,
      username: ticket.username,
      status: ticket.status,
      priority: ticket.priority,
      reason: ticket.reason,
      categoryTag: ticket.categoryTag,
      tags: ticket.tags,
      rating: ticket.rating,
      ratingFeedback: ticket.ratingFeedback,
      createdAt: ticket.createdAt,
      closedAt: ticket.closedAt,
      closedBy: ticket.closedByTag,
      firstResponseAt: ticket.firstResponseAt,
      formResponses: ticket.formResponses,
    },
    messages: messages.map((m) => ({
      author: m.authorTag,
      authorId: m.authorId,
      content: m.content,
      attachments: m.attachments,
      timestamp: m.timestamp,
    })),
    notes: includeNotes ? ticket.notes : [],
  };
  return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
}
