/**
 * ticketsRepo helpers for the tickets addon.
 */
import type { Ticket, TicketMessage } from '../types.js';
import { getTicketDb } from './db.js';

interface Row {
  id: string; guildId: string; number: number; panelId: string; channelId: string;
  userId: string; username: string; status: string; priority: string;
  categoryTag: string | null; buttonId: string | null;
  claimedBy: string | null; claimedByTag: string | null;
  closedBy: string | null; closedByTag: string | null; closedAt: Date | null;
  rating: number | null; ratingFeedback: string | null;
  firstResponseAt: Date | null; lastActivity: Date; createdAt: Date;
  data: Record<string, unknown>;
}

export function toRow(t: Ticket): Record<string, unknown> {
  const data: Record<string, unknown> = {
    tags: t.tags, notes: t.notes,
    transferredTo: t.transferredTo, transferredToTag: t.transferredToTag, reason: t.reason,
    controlsMessageId: t.controlsMessageId, notesThreadId: t.notesThreadId,
    formResponses: t.formResponses, nudgedAt: t.nudgedAt,
    reminderAt: t.reminderAt, reminderBy: t.reminderBy, reminderNote: t.reminderNote,
    closeRequestedBy: t.closeRequestedBy, closeRequestedByTag: t.closeRequestedByTag, closeRequestedAt: t.closeRequestedAt,
    aiTriage: t.aiTriage,
  };
  return {
    id: t.id, guildId: t.guildId, number: t.number, panelId: t.panelId, channelId: t.channelId,
    userId: t.userId, username: t.username, status: t.status, priority: t.priority,
    categoryTag: t.categoryTag ?? null, buttonId: t.buttonId ?? null,
    claimedBy: t.claimedBy ?? null, claimedByTag: t.claimedByTag ?? null,
    closedBy: t.closedBy ?? null, closedByTag: t.closedByTag ?? null,
    closedAt: t.closedAt ? new Date(t.closedAt) : null,
    rating: t.rating ?? null, ratingFeedback: t.ratingFeedback ?? null,
    firstResponseAt: t.firstResponseAt ? new Date(t.firstResponseAt) : null,
    lastActivity: new Date(t.lastActivity), createdAt: new Date(t.createdAt),
    data,
  };
}

export function fromRow(r: Row): Ticket {
  const d = r.data ?? {};
  const s = (k: string) => (d[k] as string | undefined);
  return {
    id: r.id, number: r.number, panelId: r.panelId, guildId: r.guildId, channelId: r.channelId,
    userId: r.userId, username: r.username,
    status: r.status as Ticket['status'], priority: r.priority as Ticket['priority'],
    categoryTag: r.categoryTag ?? undefined, buttonId: r.buttonId ?? undefined,
    claimedBy: r.claimedBy ?? undefined, claimedByTag: r.claimedByTag ?? undefined,
    closedBy: r.closedBy ?? undefined, closedByTag: r.closedByTag ?? undefined,
    closedAt: r.closedAt ? r.closedAt.toISOString() : undefined,
    rating: r.rating ?? undefined, ratingFeedback: r.ratingFeedback ?? undefined,
    firstResponseAt: r.firstResponseAt ? r.firstResponseAt.toISOString() : undefined,
    lastActivity: r.lastActivity.toISOString(), createdAt: r.createdAt.toISOString(),
    tags: (d.tags as string[]) ?? [], notes: (d.notes as Ticket['notes']) ?? [],
    transferredTo: s('transferredTo'), transferredToTag: s('transferredToTag'), reason: s('reason'),
    controlsMessageId: s('controlsMessageId'), notesThreadId: s('notesThreadId'),
    formResponses: d.formResponses as Record<string, string> | undefined,
    nudgedAt: s('nudgedAt'), reminderAt: s('reminderAt'), reminderBy: s('reminderBy'), reminderNote: s('reminderNote'),
    closeRequestedBy: s('closeRequestedBy'), closeRequestedByTag: s('closeRequestedByTag'), closeRequestedAt: s('closeRequestedAt'),
    aiTriage: d.aiTriage as Ticket['aiTriage'],
  };
}

export async function repoSaveTicket(t: Ticket): Promise<void> {
  const row = toRow(t);
  const { id, createdAt, guildId, number, ...mutable } = row;
  void createdAt; void guildId; void number;
  await getTicketDb().addonTicket.upsert({ where: { id }, create: row, update: mutable });
}
export async function repoGetTickets(guildId: string): Promise<Ticket[]> {
  const rows = (await getTicketDb().addonTicket.findMany({ where: { guildId } })) as Row[];
  return rows.map(fromRow);
}
export async function repoGetByChannel(channelId: string): Promise<Ticket | undefined> {
  const r = (await getTicketDb().addonTicket.findUnique({ where: { channelId } })) as Row | null;
  return r ? fromRow(r) : undefined;
}
export async function repoGetById(id: string): Promise<Ticket | undefined> {
  const r = (await getTicketDb().addonTicket.findUnique({ where: { id } })) as Row | null;
  return r ? fromRow(r) : undefined;
}
export async function repoGetUserOpen(guildId: string, userId: string): Promise<Ticket[]> {
  const rows = (await getTicketDb().addonTicket.findMany({ where: { guildId, userId, status: { not: 'closed' } } })) as Row[];
  return rows.map(fromRow);
}

export async function repoAppendMessage(channelId: string, m: TicketMessage): Promise<void> {
  await getTicketDb().addonTicketMessage.create({
    data: { channelId, authorId: m.authorId, authorTag: m.authorTag, content: m.content, attachments: m.attachments, timestamp: new Date(m.timestamp) },
  });
}
export async function repoGetMessages(channelId: string): Promise<TicketMessage[]> {
  const rows = (await getTicketDb().addonTicketMessage.findMany({ where: { channelId }, orderBy: { timestamp: 'asc' } })) as Array<{ authorId: string; authorTag: string; content: string; attachments: unknown; timestamp: Date }>;
  return rows.map((r) => ({ authorId: r.authorId, authorTag: r.authorTag, content: r.content, attachments: (r.attachments as string[]) ?? [], timestamp: r.timestamp.toISOString() }));
}
export async function repoDeleteMessages(channelId: string): Promise<void> {
  await getTicketDb().addonTicketMessage.deleteMany({ where: { channelId } });
}

export async function backfillTickets(tickets: Ticket[]): Promise<number> {
  for (const t of tickets) await repoSaveTicket(t);
  return tickets.length;
}
