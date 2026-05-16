/** General-purpose utility functions used across the platform. */

import { XP_PER_LEVEL_BASE, XP_MULTIPLIER } from './constants.js';

/**
 * Returns the total XP required to reach a given level.
 * Uses an exponential curve: `floor(XP_PER_LEVEL_BASE * level ^ XP_MULTIPLIER)`.
 */
export function xpForLevel(level: number): number {
  return Math.floor(XP_PER_LEVEL_BASE * Math.pow(level, XP_MULTIPLIER));
}

/**
 * Returns the level a user has reached given their total accumulated XP.
 * Iterates the level curve until the remaining XP is insufficient for the next level.
 */
export function levelFromXp(xp: number): number {
  let level = 0;
  let totalXp = 0;
  while (totalXp + xpForLevel(level + 1) <= xp) {
    totalXp += xpForLevel(level + 1);
    level++;
  }
  return level;
}

/**
 * Converts a duration in seconds to a human-readable string such as `1d 4h 30m`.
 * At least one unit is always included, so `0` seconds returns `"0s"`.
 */
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Parses a compact duration string (e.g. `"7d"`, `"2h"`, `"30m"`, `"60s"`) into seconds.
 * Returns `null` when the string does not match the expected format.
 */
export function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };

  return value * (multipliers[unit] ?? 1);
}

/**
 * Replaces `{key}` placeholders in a template string with values from the provided map.
 * Unrecognised placeholders are left unchanged.
 *
 * @example
 * formatTemplate('Hello {user}!', { user: 'Alice' }) // 'Hello Alice!'
 */
export function formatTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

/**
 * Truncates a string to `maxLength` characters, appending `suffix` when truncation occurs.
 * The total length of the returned string never exceeds `maxLength`.
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Returns a Promise that resolves after the specified number of milliseconds.
 * Useful for rate-limit backoff without blocking the event loop.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns `true` when the given string is a valid Discord snowflake ID
 * (17–20 decimal digits).
 */
export function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

/**
 * Returns a slice of `items` for the given 1-based page, along with pagination metadata.
 *
 * @param items - The full array to paginate.
 * @param page - The 1-based page number to retrieve.
 * @param pageSize - The maximum number of items per page.
 */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean } {
  const start = (page - 1) * pageSize;
  const sliced = items.slice(start, start + pageSize);
  return {
    items: sliced,
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}
