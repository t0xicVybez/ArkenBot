import { describe, it, expect } from 'vitest';
import { computeNextOccurrence, getZonedParts, wallClockToUtc } from '../../packages/shared/src/index.js';

const H = 3600_000, D = 86_400_000;

describe('getZonedParts (UTC)', () => {
  it('breaks a UTC instant into its parts', () => {
    const p = getZonedParts(new Date('2026-06-15T09:30:00Z'), 'UTC');
    expect(p).toMatchObject({ year: 2026, month: 6, day: 15, hour: 9, minute: 30 });
    expect(p.weekday).toBe(new Date('2026-06-15T09:30:00Z').getUTCDay());
  });
});

describe('wallClockToUtc (UTC round-trip)', () => {
  it('maps wall-clock UTC back to the same instant', () => {
    const utc = wallClockToUtc(2026, 6, 15, 9, 30, 'UTC');
    expect(utc.toISOString()).toBe('2026-06-15T09:30:00.000Z');
  });
});

describe('computeNextOccurrence', () => {
  const base = new Date('2026-06-15T09:30:00Z'); // a Monday

  it('returns null for a one-shot (no repeat)', () => {
    expect(computeNextOccurrence(base, null)).toBeNull();
    expect(computeNextOccurrence(base, undefined)).toBeNull();
    expect(computeNextOccurrence(base, 'nonsense')).toBeNull();
  });

  it('hourly advances exactly one hour', () => {
    expect(computeNextOccurrence(base, 'hourly')!.getTime()).toBe(base.getTime() + H);
  });

  it('daily keeps wall-clock time on the next day (UTC = +24h)', () => {
    expect(computeNextOccurrence(base, 'daily', 'UTC')!.getTime()).toBe(base.getTime() + D);
  });

  it('weekly with no days advances 7 days', () => {
    expect(computeNextOccurrence(base, 'weekly', 'UTC')!.getTime()).toBe(base.getTime() + 7 * D);
  });

  it('weekly with days lands on the next matching weekday within 7 days', () => {
    const days = [3, 5]; // Wed, Fri
    const next = computeNextOccurrence(base, 'weekly', 'UTC', days)!;
    expect(days).toContain(next.getUTCDay());
    const deltaDays = Math.round((next.getTime() - base.getTime()) / D);
    expect(deltaDays).toBeGreaterThanOrEqual(1);
    expect(deltaDays).toBeLessThanOrEqual(7);
    // same wall-clock time preserved
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(30);
  });
});
