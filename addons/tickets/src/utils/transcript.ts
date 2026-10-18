/**
 * transcript helpers for the tickets addon.
 * The actual builders live in @arkenbot/shared (buildTicketTranscriptHtml/
 * Text/Json) so the bot and the API dashboard-download route share one
 * implementation instead of independently-maintained copies.
 */
import { buildTicketTranscriptHtml, buildTicketTranscriptText, buildTicketTranscriptJson } from '@arkenbot/shared';
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
  includeNotes = true,
): Buffer {
  return Buffer.from(buildTicketTranscriptText(ticket, panel, messages, includeNotes), 'utf-8');
}

export function generateTranscriptJson(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  includeNotes = true,
): Buffer {
  return Buffer.from(buildTicketTranscriptJson(ticket, panel, messages, includeNotes), 'utf-8');
}
