/**
 * Fetches the authenticated user's Discord guild list (`/users/@me/guilds`)
 * with two layers of protection against Discord rate limits:
 *
 *  1. **Redis cache** (short TTL) — subsequent dashboard loads reuse the list
 *     instead of re-hitting Discord.
 *  2. **In-process coalescing** — a single dashboard load fires many guild-admin
 *     endpoints in parallel; without this, each would independently call
 *     `/users/@me/guilds` and trip Discord's 429, surfacing as blanket 500s.
 *     The in-flight promise is shared so those parallel requests make one call.
 */
import { redis } from '../redis.js';

export type UserGuild = { id: string; permissions: string; owner?: boolean };

/** Thrown when Discord rate-limits the guild-list fetch. */
export class GuildFetchRateLimited extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Rate limited by Discord while fetching guild list');
    this.name = 'GuildFetchRateLimited';
  }
}

const CACHE_TTL_SECONDS = 60;
const cacheKey = (userId: string) => `api:user_guilds:${userId}`;

// Coalesces concurrent fetches for the same user within this process.
const inflight = new Map<string, Promise<UserGuild[]>>();

/**
 * Returns the user's guild list, served from Redis when fresh and otherwise
 * fetched from Discord (with concurrent callers sharing one request). Throws
 * {@link GuildFetchRateLimited} if Discord returns 429.
 */
export async function getUserGuilds(userId: string, accessToken: string): Promise<UserGuild[]> {
  const cached = await redis.get(cacheKey(userId)).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as UserGuild[];
    } catch {
      // fall through to a fresh fetch on a corrupt cache entry
    }
  }

  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = fetchFromDiscord(accessToken)
    .then(async (guilds) => {
      await redis.set(cacheKey(userId), JSON.stringify(guilds), 'EX', CACHE_TTL_SECONDS).catch(() => {});
      return guilds;
    })
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, promise);
  return promise;
}

async function fetchFromDiscord(accessToken: string): Promise<UserGuild[]> {
  const { default: axios, isAxiosError } = await import('axios');
  const all: UserGuild[] = [];
  let after: string | undefined;

  try {
    // Paginate (200/page); stop early once fewer than a full page is returned.
    for (let page = 0; page < 10; page++) {
      const url = `https://discord.com/api/v10/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`;
      const res = await axios.get<UserGuild[]>(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      all.push(...res.data);
      if (res.data.length < 200) break;
      after = res.data[res.data.length - 1].id;
    }
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 429) {
      const retryAfter = Number(err.response.headers['retry-after']) || 1;
      throw new GuildFetchRateLimited(retryAfter);
    }
    throw err;
  }

  return all;
}
