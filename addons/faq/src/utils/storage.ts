import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { FaqEntry } from '../types.js';

const KEY = 'entries';
const MAX_ENTRIES = 200;

export async function getEntries(storage: AddonStorage, guildId: string): Promise<FaqEntry[]> {
  return (await storage.get<FaqEntry[]>(KEY, guildId)) ?? [];
}

export async function findEntry(storage: AddonStorage, guildId: string, id: string): Promise<FaqEntry | null> {
  return (await getEntries(storage, guildId)).find((e) => e.id === id) ?? null;
}

export async function findByTitle(storage: AddonStorage, guildId: string, title: string): Promise<FaqEntry | null> {
  const t = title.trim().toLowerCase();
  return (await getEntries(storage, guildId)).find((e) => e.title.toLowerCase() === t) ?? null;
}

export async function saveEntry(storage: AddonStorage, guildId: string, entry: FaqEntry): Promise<void> {
  const entries = await getEntries(storage, guildId);
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await storage.set(KEY, entries, guildId);
}

export async function deleteEntry(storage: AddonStorage, guildId: string, id: string): Promise<boolean> {
  const entries = await getEntries(storage, guildId);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  await storage.set(KEY, next, guildId);
  return true;
}

export function atCapacity(count: number): boolean {
  return count >= MAX_ENTRIES;
}

/** Rank entries against a query over title + tags. Returns best matches first. */
export function search(entries: FaqEntry[], query: string): FaqEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice().sort((a, b) => b.uses - a.uses);
  const score = (e: FaqEntry): number => {
    const title = e.title.toLowerCase();
    const hay = `${title} ${e.tags.join(' ')}`;
    if (title === q) return 100;
    if (title.startsWith(q)) return 60;
    if (title.includes(q)) return 40;
    if (e.tags.some((t) => t === q)) return 35;
    if (hay.includes(q)) return 20;
    return 0;
  };
  return entries
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.uses - a.e.uses)
    .map((x) => x.e);
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
