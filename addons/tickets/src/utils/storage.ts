/**
 * storage helpers for the tickets addon.
 */
import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { Ticket, TicketPanel, TicketMessage, GuildTicketConfig, CannedResponse } from '../types.js';
import {
  repoSaveTicket, repoAppendMessage,
  repoGetTickets, repoGetByChannel, repoGetById, repoGetUserOpen, repoGetMessages,
} from './ticketsRepo.js';
import { publishTicketUpdate } from './liveSync.js';

const KEY_PANELS = 'panels';
const KEY_COUNTER = 'counter';
const KEY_CONFIG = 'config';
const KEY_CANNED = 'canned-responses';

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
  // Every ticket mutation (claim/priority/tags/notes/status/close/reopen/...)
  // flows through here regardless of caller, so this is the one place that
  // needs to notify live dashboard clients — see utils/liveSync.ts.
  void publishTicketUpdate(ticket.guildId, ticket.id, ticket.channelId);
}

export async function getUserOpenTickets(
  _storage: AddonStorage,
  guildId: string,
  userId: string,
): Promise<Ticket[]> {
  return repoGetUserOpen(guildId, userId);
}

export async function nextTicketNumber(
  storage: AddonStorage,
  guildId: string,
): Promise<number> {

  return storage.mutate<number>(KEY_COUNTER, (cur) => (cur ?? 0) + 1, guildId);
}

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

// Applies `mutate` to the freshest stored config under the addon's per-key lock,
// so a concurrent change (dashboard edit, another ticket opening) can't be
// overwritten by a copy that was read earlier.
export async function updateConfig(
  storage: AddonStorage,
  guildId: string,
  mutate: (config: GuildTicketConfig) => void,
): Promise<GuildTicketConfig> {
  return storage.mutate<GuildTicketConfig>(KEY_CONFIG, (cur) => {
    const config = cur ?? { blacklistedUsers: [] };
    mutate(config);
    return config;
  }, guildId);
}

export async function getCannedResponses(storage: AddonStorage, guildId: string): Promise<CannedResponse[]> {
  return (await storage.get<CannedResponse[]>(KEY_CANNED, guildId)) ?? [];
}

export async function saveCannedResponses(storage: AddonStorage, guildId: string, responses: CannedResponse[]): Promise<void> {
  await storage.set(KEY_CANNED, responses, guildId);
}

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
