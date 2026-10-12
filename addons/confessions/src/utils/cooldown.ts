/**
 * cooldown helpers for the confessions addon.
 */
const last = new Map<string, number>();
const key = (g: string, u: string) => `${g}:${u}`;

export function cooldownRemaining(guildId: string, userId: string, cooldownSec: number): number {
  const prev = last.get(key(guildId, userId));
  if (prev === undefined) return 0;
  const elapsed = (Date.now() - prev) / 1000;
  return elapsed >= cooldownSec ? 0 : Math.ceil(cooldownSec - elapsed);
}

export function markUsed(guildId: string, userId: string): void {
  last.set(key(guildId, userId), Date.now());
}
