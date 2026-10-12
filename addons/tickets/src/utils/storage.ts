import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { Ticket, TicketPanel, TicketMessage, GuildTicketConfig, CannedResponse } from '../types.js';
import { hasTicketDb } from './db.js';
import { repoSaveTicket, repoAppendMessage, repoDeleteMessages } from './ticketsRepo.js';

// ── P1.2 migration (dual-write phase) ──────────────────────────────────────────
// The JSON blob remains the source of truth and is what reads use; ticket and
// message writes are *also* mirrored to the relational tables (best-effort —
// a mirror error never fails the authoritative blob write). Reads flip to the
// tables only after backfill + verification.

// ─── Storage Keys ─────────────────────────────────────────────────────────────
// All keys are per-guild unless noted.
const KEY_PANELS = 'panels';
const KEY_TICKETS = 'tickets';
const KEY_COUNTER = 'counter';
const KEY_CONFIG = 'config';
const KEY_CANNED = 'canned-responses';

/** Messages stored globally (channelId is globally unique in Discord) */
function msgKey(channelId: string): string {
  return `msgs:${channelId}`;
}

// ─── Panels ───────────────────────────────────────────────────────────────────

export async function getPanels(storage: AddonStorage, guildId: string): Promise<TicketPanel[]> {
  return (await storage.get<TicketPanel[]>(KEY_PANELS, guildId)) ?? [];
}

export async function getPanel(
  storage: AddonStorage,
  guildId: string,
  panelId: string,
): Promise<TicketPanel | undefined> {
  const panels = await getPanels(storage, guildId);
  return panels.find((p) => p.id === panelId);
}

export async function savePanel(
  storage: AddonStorage,
  guildId: string,
  panel: TicketPanel,
): Promise<void> {
  await storage.mutate<TicketPanel[]>(KEY_PANELS, (cur) => {
    const panels = cur ?? [];
    const idx = panels.findIndex((p) => p.id === panel.id);
    if (idx >= 0) panels[idx] = panel;
    else panels.push(panel);
    return panels;
  }, guildId);
}

export async function deletePanel(
  storage: AddonStorage,
  guildId: string,
  panelId: string,
): Promise<void> {
  await storage.mutate<TicketPanel[]>(KEY_PANELS, (cur) => (cur ?? []).filter((p) => p.id !== panelId), guildId);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export async function getTickets(storage: AddonStorage, guildId: string): Promise<Ticket[]> {
  return (await storage.get<Ticket[]>(KEY_TICKETS, guildId)) ?? [];
}

export async function getTicketByChannel(
  storage: AddonStorage,
  guildId: string,
  channelId: string,
): Promise<Ticket | undefined> {
  const tickets = await getTickets(storage, guildId);
  return tickets.find((t) => t.channelId === channelId);
}

export async function getTicketById(
  storage: AddonStorage,
  guildId: string,
  ticketId: string,
): Promise<Ticket | undefined> {
  const tickets = await getTickets(storage, guildId);
  return tickets.find((t) => t.id === ticketId);
}

export async function saveTicket(
  storage: AddonStorage,
  guildId: string,
  ticket: Ticket,
): Promise<void> {
  await storage.mutate<Ticket[]>(KEY_TICKETS, (cur) => {
    const tickets = cur ?? [];
    const idx = tickets.findIndex((t) => t.id === ticket.id);
    if (idx >= 0) tickets[idx] = ticket;
    else tickets.push(ticket);
    return tickets;
  }, guildId);
  if (hasTicketDb()) { try { await repoSaveTicket(ticket); } catch { /* dual-write mirror; blob is source of truth */ } }
}

/** Returns the open tickets belonging to a specific user in this guild. */
export async function getUserOpenTickets(
  storage: AddonStorage,
  guildId: string,
  userId: string,
): Promise<Ticket[]> {
  const tickets = await getTickets(storage, guildId);
  return tickets.filter((t) => t.userId === userId && t.status !== 'closed');
}

// ─── Counter ──────────────────────────────────────────────────────────────────

export async function nextTicketNumber(
  storage: AddonStorage,
  guildId: string,
): Promise<number> {
  // Atomic increment so concurrent opens never collide on a ticket number.
  return storage.mutate<number>(KEY_COUNTER, (cur) => (cur ?? 0) + 1, guildId);
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(
  storage: AddonStorage,
  guildId: string,
): Promise<GuildTicketConfig> {
  return (
    (await storage.get<GuildTicketConfig>(KEY_CONFIG, guildId)) ?? {
      blacklistedUsers: [],
    }
  );
}

export async function saveConfig(
  storage: AddonStorage,
  guildId: string,
  config: GuildTicketConfig,
): Promise<void> {
  await storage.set(KEY_CONFIG, config, guildId);
}

// ─── Canned Responses ─────────────────────────────────────────────────────────

export async function getCannedResponses(storage: AddonStorage, guildId: string): Promise<CannedResponse[]> {
  return (await storage.get<CannedResponse[]>(KEY_CANNED, guildId)) ?? [];
}

export async function saveCannedResponses(storage: AddonStorage, guildId: string, responses: CannedResponse[]): Promise<void> {
  await storage.set(KEY_CANNED, responses, guildId);
}

// ─── Messages (Transcript) ────────────────────────────────────────────────────

export async function getMessages(
  storage: AddonStorage,
  channelId: string,
): Promise<TicketMessage[]> {
  return (await storage.get<TicketMessage[]>(msgKey(channelId))) ?? [];
}

export async function appendMessage(
  storage: AddonStorage,
  channelId: string,
  msg: TicketMessage,
): Promise<void> {
  await storage.mutate<TicketMessage[]>(msgKey(channelId), (cur) => {
    const msgs = cur ?? [];
    msgs.push(msg);
    return msgs;
  });
  if (hasTicketDb()) { try { await repoAppendMessage(channelId, msg); } catch { /* dual-write mirror */ } }
}

export async function deleteMessages(storage: AddonStorage, channelId: string): Promise<void> {
  await storage.delete(msgKey(channelId));
  if (hasTicketDb()) { try { await repoDeleteMessages(channelId); } catch { /* dual-write mirror */ } }
}
