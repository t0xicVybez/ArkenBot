import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { Ticket, TicketPanel, TicketMessage, GuildTicketConfig, CannedResponse } from '../types.js';
import {
  repoSaveTicket, repoAppendMessage, repoDeleteMessages,
  repoGetTickets, repoGetByChannel, repoGetById, repoGetUserOpen, repoGetMessages,
} from './ticketsRepo.js';

// ── P1.2 (DB-only) ─────────────────────────────────────────────────────────────
// Tickets and ticket messages live in the relational AddonTicket /
// AddonTicketMessage tables — the single source of truth. Panels, config,
// canned responses, and the ticket-number counter remain small KV values in
// AddonData. The old JSON ticket/message blobs have been migrated out and removed.

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

 
// `storage`/`guildId`(where derivable from the ticket) are kept in these
// signatures so the many call sites don't change; tickets now read/write the DB.
export async function getTickets(_storage: AddonStorage, guildId: string): Promise<Ticket[]> {
  return repoGetTickets(guildId);
}

export async function getTicketByChannel(
  _storage: AddonStorage,
  _guildId: string,
  channelId: string,
): Promise<Ticket | undefined> {
  return repoGetByChannel(channelId);
}

export async function getTicketById(
  _storage: AddonStorage,
  _guildId: string,
  ticketId: string,
): Promise<Ticket | undefined> {
  return repoGetById(ticketId);
}

export async function saveTicket(
  _storage: AddonStorage,
  _guildId: string,
  ticket: Ticket,
): Promise<void> {
  await repoSaveTicket(ticket);
}

/** Returns the open tickets belonging to a specific user in this guild. */
export async function getUserOpenTickets(
  _storage: AddonStorage,
  guildId: string,
  userId: string,
): Promise<Ticket[]> {
  return repoGetUserOpen(guildId, userId);
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
  _storage: AddonStorage,
  channelId: string,
): Promise<TicketMessage[]> {
  return repoGetMessages(channelId);
}

export async function appendMessage(
  _storage: AddonStorage,
  channelId: string,
  msg: TicketMessage,
): Promise<void> {
  await repoAppendMessage(channelId, msg);
}

export async function deleteMessages(_storage: AddonStorage, channelId: string): Promise<void> {
  await repoDeleteMessages(channelId);
}
