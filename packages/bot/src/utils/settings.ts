import { redis } from '../redis.js';
import { prisma } from '../database.js';
import { REDIS_KEYS } from '@arkenbot/shared';
import type { GuildSettings } from '@arkenbot/shared';

const ADDON_CACHE_TTL = 60;

const SETTINGS_TTL = 300;

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  const cacheKey = REDIS_KEYS.GUILD_SETTINGS(guildId);

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as GuildSettings;
  }

  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  if (!settings) return null;

  const parsed = settings as unknown as GuildSettings;

  await redis.setex(cacheKey, SETTINGS_TTL, JSON.stringify(parsed));

  return parsed;
}

export async function invalidateSettingsCache(guildId: string): Promise<void> {
  await redis.del(REDIS_KEYS.GUILD_SETTINGS(guildId));
}

export async function isAddonEnabledForGuild(addonName: string, guildId: string): Promise<boolean> {
  const cacheKey = REDIS_KEYS.GUILD_ADDON(guildId, addonName);

  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const record = await prisma.guildAddon.findFirst({
    where: {
      guildId,
      enabled: true,
      addon: { name: addonName, enabled: true },
    },
    select: { id: true },
  });

  const enabled = record !== null;
  await redis.setex(cacheKey, ADDON_CACHE_TTL, enabled ? '1' : '0');
  return enabled;
}

export async function invalidateAddonCache(guildId: string, addonName: string): Promise<void> {
  await redis.del(REDIS_KEYS.GUILD_ADDON(guildId, addonName));
}

export async function ensureGuildExists(
  guildId: string,
  name: string,
  ownerId: string,
  iconUrl?: string
): Promise<void> {
  await prisma.guild.upsert({
    where: { id: guildId },
    update: { name, ownerId, iconUrl, isActive: true, leftAt: null },
    create: {
      id: guildId,
      name,
      ownerId,
      iconUrl,
      settings: {
        create: {},
      },
    },
  });
}

export async function getNextCaseNumber(guildId: string): Promise<number> {
  const lastCase = await prisma.moderationCase.findFirst({
    where: { guildId },
    orderBy: { caseNumber: 'desc' },
  });
  return (lastCase?.caseNumber ?? 0) + 1;
}
