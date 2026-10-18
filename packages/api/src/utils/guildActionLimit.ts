/**
 * Per-guild action rate limiting for the dashboard.
 *
 * The global HTTP rate-limit is coarse and IP-based. This adds a behavioural
 * cap keyed by (guild, actor): how many *mutating* dashboard actions one user
 * may make to one server in a short window. It blunts a compromised session or
 * a runaway script hammering the API, and raises a guild-visible alert on a
 * clear flood (the web-surface counterpart to anti-nuke).
 *
 * Fails open: if Redis is unavailable we never lock an admin out of their own
 * dashboard over a cache hiccup.
 */
import { redis, pub } from '../redis.js';

export const GUILD_ACTION_WINDOW_SEC = 60;
// Legitimate dashboard use is a handful of saves a minute; 40 leaves generous
// headroom. 80 in a window is unmistakably scripted/abusive → alert the guild.
const SOFT_LIMIT = 40;
const ANOMALY_LIMIT = 80;

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

export interface ActionLimitVerdict {
  limited: boolean;
  anomaly: boolean;
  count: number;
}

/** Count this action and report whether the actor is over the soft/anomaly line. */
export async function checkGuildActionLimit(guildId: string, userId: string): Promise<ActionLimitVerdict> {
  const key = `ratelimit:guildaction:${guildId}:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, GUILD_ACTION_WINDOW_SEC);
    return {
      limited: count > SOFT_LIMIT,
      // Exactly at the threshold so the alert fires once per window, not on every
      // subsequent request in the same burst.
      anomaly: count === ANOMALY_LIMIT,
      count,
    };
  } catch {
    return { limited: false, anomaly: false, count: 0 };
  }
}

/** Tell the bot to post a security alert to the guild (fire-and-forget). */
export async function alertGuildActionFlood(guildId: string, userId: string, count: number): Promise<void> {
  await pub.publish('api:events', JSON.stringify({
    type: 'security:dashboardFlood',
    data: { guildId, userId, count, windowSeconds: GUILD_ACTION_WINDOW_SEC },
  })).catch(() => undefined);
}
