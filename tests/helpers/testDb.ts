
import { readFileSync, existsSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { AddonStorage } from '../../packages/addon-sdk/src/types.js';

export function resolveTestDbUrl(): string | null {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  try {
    if (!existsSync('.env')) return null;
    const m = readFileSync('.env', 'utf8').match(/^TEST_DATABASE_URL=(.*)$/m);
    return m ? m[1].replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

export const TEST_DB_URL = resolveTestDbUrl();

let _prisma: PrismaClient | null = null;
export function testPrisma(): PrismaClient {
  if (!TEST_DB_URL) throw new Error('TEST_DATABASE_URL is not set — DB tests should be skipped.');
  if (!_prisma) _prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DB_URL }) });
  return _prisma;
}

export async function closeTestDb(): Promise<void> {
  if (_prisma) await _prisma.$disconnect();
  _prisma = null;
}

export async function seedAddon(name = 'tickets'): Promise<string> {
  const p = testPrisma();
  const existing = await p.addon.findUnique({ where: { name }, select: { id: true } });
  if (existing) return existing.id;
  const row = await p.addon.create({
    data: { name, displayName: name, version: '1.0.0', description: 'test', author: 'test', manifest: {} },
  });
  return row.id;
}

export async function seedGuild(guildId: string): Promise<void> {
  const p = testPrisma();
  await p.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: `test-${guildId}`, ownerId: '1' },
  });
}

export async function clearAddonData(): Promise<void> {
  await testPrisma().addonData.deleteMany({});
}

export function makeStorage(addonId: string): AddonStorage {
  const p = testPrisma();
  const self: AddonStorage = {
    async get<T>(key: string, guildId?: string): Promise<T | null> {
      const row = guildId
        ? await p.addonData.findUnique({ where: { guildId_addonId_key: { guildId, addonId, key } } })
        : await p.addonData.findFirst({ where: { guildId: null, addonId, key } });
      return row ? (row.value as T) : null;
    },
    async set<T>(key: string, value: T, guildId?: string): Promise<void> {
      if (guildId) {
        await p.addonData.upsert({
          where: { guildId_addonId_key: { guildId, addonId, key } },
          update: { value: value as object },
          create: { guildId, addonId, key, value: value as object },
        });
      } else {
        const e = await p.addonData.findFirst({ where: { guildId: null, addonId, key }, select: { id: true } });
        if (e) await p.addonData.update({ where: { id: e.id }, data: { value: value as object } });
        else await p.addonData.create({ data: { guildId: null, addonId, key, value: value as object } });
      }
    },
    async mutate<T>(key: string, mutator: (cur: T | null) => T | Promise<T>, guildId?: string): Promise<T> {
      const cur = await self.get<T>(key, guildId);
      const next = await mutator(cur);
      await self.set(key, next, guildId);
      return next;
    },
    async delete(key: string, guildId?: string): Promise<void> {
      await p.addonData.deleteMany({ where: { guildId: guildId ?? null, addonId, key } });
    },
    async keys(): Promise<string[]> {
      return [];
    },
  };
  return self;
}
