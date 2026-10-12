/**
 * Guild settings and addon-enabled lookups, with Redis caching.
 *
 * These are read on hot paths (every command, many events), so results are
 * cached in Redis for a short window and the cache is invalidated whenever the
 * dashboard changes something. Also holds a couple of small guild helpers
 * (first-time guild creation and the per-guild moderation case counter).
 */
import { redis } from '../redis.js';
import { prisma } from '../database.js';
import { REDIS_KEYS } from '@arkenbot/shared';
import type { GuildSettings } from '@arkenbot/shared';

const ADDON_CACHE_TTL = 60;   // seconds — addon-enabled checks are very frequent
const SETTINGS_TTL = 300;     // seconds — full settings change rarely

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  const cacheKey = REDIS_KEYS.GUILD_SETTINGS(guildId);

  // Serve from cache when we can; fall through to the database on a miss.
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

/**
 * Whether an addon is installed and enabled for a guild. Cached as '1'/'0' so
 * the common case costs one fast Redis read instead of a database join.
 */
export async function isAddonEnabledForGuild(addonName: string, guildId: string): Promise<boolean> {
  const cacheKey = REDIS_KEYS.GUILD_ADDON(guildId, addonName);

  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  // Both the guild's install AND the addon itself must be enabled.
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

/**
 * Make sure a guild row exists (creating its settings on first join) and mark
 * it active. Called when the bot joins or re-joins a server.
 */
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

// Moderation cases are numbered per guild (Case #1, #2, …). This returns the
// next number in sequence.
export async function getNextCaseNumber(guildId: string): Promise<number> {
  const lastCase = await prisma.moderationCase.findFirst({
    where: { guildId },
    orderBy: { caseNumber: 'desc' },
  });
  return (lastCase?.caseNumber ?? 0) + 1;
}
