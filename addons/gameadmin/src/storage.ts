import { randomUUID } from 'crypto';
import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { SavedGameServer } from './types.js';

const KEY = 'servers';
const PENDING_KEY = 'pending';

export async function getServers(storage: AddonStorage, guildId: string): Promise<SavedGameServer[]> {
  return (await storage.get<SavedGameServer[]>(KEY, guildId)) ?? [];
}

export async function findServer(storage: AddonStorage, guildId: string, nameOrId: string): Promise<SavedGameServer | undefined> {
  const servers = await getServers(storage, guildId);
  const needle = nameOrId.toLowerCase();
  return servers.find((s) => s.id === nameOrId || s.name.toLowerCase() === needle);
}

export async function saveServer(storage: AddonStorage, guildId: string, server: SavedGameServer): Promise<void> {
  const servers = await getServers(storage, guildId);
  const idx = servers.findIndex((s) => s.id === server.id);
  if (idx >= 0) servers[idx] = server;
  else servers.push(server);
  await storage.set(KEY, servers, guildId);
}

export async function deleteServer(storage: AddonStorage, guildId: string, id: string): Promise<boolean> {
  const servers = await getServers(storage, guildId);
  const next = servers.filter((s) => s.id !== id);
  if (next.length === servers.length) return false;
  await storage.set(KEY, next, guildId);
  return true;
}

export function newServerId(): string {
  return randomUUID().slice(0, 8);
}

/** A parked `/gameadmin add` awaiting its RCON password from a modal. */
export interface PendingAdd {
  name: string;
  game: string;
  host: string;
  port: number;
}

export async function setPending(storage: AddonStorage, guildId: string, userId: string, pending: PendingAdd): Promise<void> {
  const all = (await storage.get<Record<string, PendingAdd>>(PENDING_KEY, guildId)) ?? {};
  all[userId] = pending;
  await storage.set(PENDING_KEY, all, guildId);
}

export async function takePending(storage: AddonStorage, guildId: string, userId: string): Promise<PendingAdd | undefined> {
  const all = (await storage.get<Record<string, PendingAdd>>(PENDING_KEY, guildId)) ?? {};
  const pending = all[userId];
  if (pending) { delete all[userId]; await storage.set(PENDING_KEY, all, guildId); }
  return pending;
}
