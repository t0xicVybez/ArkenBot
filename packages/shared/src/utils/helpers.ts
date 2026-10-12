/**
 * Small, pure utility functions shared by the bot, API and web — XP/level math, duration formatting and parsing, template filling, text truncation, snowflake validation and pagination. No side effects, so they're trivial to unit test.
 */
import { XP_PER_LEVEL_BASE, XP_MULTIPLIER } from './constants.js';

export function xpForLevel(level: number): number {
  return Math.floor(XP_PER_LEVEL_BASE * Math.pow(level, XP_MULTIPLIER));
}

export function levelFromXp(xp: number): number {
  let level = 0;
  let totalXp = 0;
  while (totalXp + xpForLevel(level + 1) <= xp) {
    totalXp += xpForLevel(level + 1);
    level++;
  }
  return level;
}

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

export function formatTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

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
