import { randomUUID } from 'crypto';
import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { SavedServer } from '../types.js';

const KEY = 'servers';

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
