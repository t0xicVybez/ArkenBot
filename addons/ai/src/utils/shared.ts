/** Shared helpers for the AI assistant commands. */

export const AI_UNAVAILABLE_MESSAGE =
  '🤖 AI features are not configured on this bot. An administrator needs to set `GROQ_API_KEY`.';

/** Per-user cooldown between AI invocations, to bound cost and abuse. */
const COOLDOWN_MS = 8_000;
const lastUsed = new Map<string, number>();

/**
 * Returns the seconds a user must wait before invoking an AI command again, or
 * `null` if they are clear (which also starts a fresh cooldown for them).
 */
export function checkCooldown(userId: string): number | null {
  const now = Date.now();
  const last = lastUsed.get(userId) ?? 0;
  const remaining = last + COOLDOWN_MS - now;
  if (remaining > 0) return Math.ceil(remaining / 1000);
  lastUsed.set(userId, now);
  return null;
}
