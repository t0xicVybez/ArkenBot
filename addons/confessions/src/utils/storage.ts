import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { ConfessionConfig, ConfessionRecord } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';

const KEY_CONFIG = 'config';
const KEY_RECORDS = 'records';
/** Keep the most recent N records for staff audit (whois); older ones are pruned. */
const MAX_RECORDS = 300;

export async function getConfig(storage: AddonStorage, guildId: string): Promise<ConfessionConfig> {
  const saved = await storage.get<Partial<ConfessionConfig>>(KEY_CONFIG, guildId);
  return { ...DEFAULT_CONFIG, ...(saved ?? {}) };
}

export async function saveConfig(storage: AddonStorage, guildId: string, config: ConfessionConfig): Promise<void> {
  await storage.set(KEY_CONFIG, config, guildId);
}

/** Atomically bump and persist the confession counter, returning the new number. */
export async function nextNumber(storage: AddonStorage, guildId: string): Promise<{ number: number; config: ConfessionConfig }> {
  const config = await getConfig(storage, guildId);
  config.counter += 1;
  await saveConfig(storage, guildId, config);
  return { number: config.counter, config };
}

export async function getRecords(storage: AddonStorage, guildId: string): Promise<ConfessionRecord[]> {
  return (await storage.get<ConfessionRecord[]>(KEY_RECORDS, guildId)) ?? [];
}

export async function findRecord(storage: AddonStorage, guildId: string, id: string): Promise<ConfessionRecord | null> {
  return (await getRecords(storage, guildId)).find((r) => r.id === id) ?? null;
}

export async function findByNumber(storage: AddonStorage, guildId: string, number: number): Promise<ConfessionRecord | null> {
  return (await getRecords(storage, guildId)).find((r) => r.number === number) ?? null;
}

export async function saveRecord(storage: AddonStorage, guildId: string, record: ConfessionRecord): Promise<void> {
  let records = await getRecords(storage, guildId);
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  // Prune oldest by keeping the last MAX_RECORDS entries.
  if (records.length > MAX_RECORDS) records = records.slice(records.length - MAX_RECORDS);
  await storage.set(KEY_RECORDS, records, guildId);
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
