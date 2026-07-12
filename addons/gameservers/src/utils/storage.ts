import { randomUUID } from 'crypto';
import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { SavedServer } from '../types.js';

const KEY = 'servers';
const PENDING_KEY = 'pending';

/**
 * An `/server add` or `/server status` parked while we collect the admin password
 * from a modal — the modal submit is a separate interaction, so the original
 * command's arguments have to survive the round trip.
 */
export interface PendingQuery {
  action: 'add' | 'status';
  name?: string;
  game: string;
  host: string;
  port?: number;
}

/** Parks a command's arguments against the user who invoked it. */
export async function setPending(
  storage: AddonStorage,
  guildId: string,
  userId: string,
  pending: PendingQuery,
): Promise<void> {
  const all = (await storage.get<Record<string, PendingQuery>>(PENDING_KEY, guildId)) ?? {};
  all[userId] = pending;
  await storage.set(PENDING_KEY, all, guildId);
}

/** Retrieves and clears a parked command — a pending entry is good for one submit. */
export async function takePending(
  storage: AddonStorage,
  guildId: string,
  userId: string,
): Promise<PendingQuery | undefined> {
  const all = (await storage.get<Record<string, PendingQuery>>(PENDING_KEY, guildId)) ?? {};
  const pending = all[userId];
  if (!pending) return undefined;

  delete all[userId];
  await storage.set(PENDING_KEY, all, guildId);
  return pending;
}

export async function getServers(storage: AddonStorage, guildId: string): Promise<SavedServer[]> {
  return (await storage.get<SavedServer[]>(KEY, guildId)) ?? [];
}

export async function getServerByName(
  storage: AddonStorage,
  guildId: string,
  name: string,
): Promise<SavedServer | undefined> {
  const servers = await getServers(storage, guildId);
  return servers.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

export async function addServer(
  storage: AddonStorage,
  guildId: string,
  server: Omit<SavedServer, 'id' | 'addedAt'>,
): Promise<SavedServer> {
  const servers = await getServers(storage, guildId);
  const saved: SavedServer = { id: randomUUID(), addedAt: new Date().toISOString(), ...server };
  servers.push(saved);
  await storage.set(KEY, servers, guildId);
  return saved;
}

export async function removeServer(
  storage: AddonStorage,
  guildId: string,
  name: string,
): Promise<boolean> {
  const servers = await getServers(storage, guildId);
  const filtered = servers.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
  if (filtered.length === servers.length) return false;
  await storage.set(KEY, filtered, guildId);
  return true;
}
