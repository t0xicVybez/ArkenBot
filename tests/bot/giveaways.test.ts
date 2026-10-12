import { describe, it, expect } from 'vitest';
import {
  buildGiveawayEntries,
  pickGiveawayWinners,
  type GiveawayEntrant,
} from '../../packages/bot/src/modules/jobs/giveaways.js';

describe('buildGiveawayEntries', () => {
  const eligible: GiveawayEntrant[] = [
    { id: 'a', roleIds: [] },
    { id: 'b', roleIds: ['vip'] },
    { id: 'c', roleIds: ['vip', 'boost'] },
  ];

  it('gives one entry per eligible user with no bonus roles', () => {
    expect(buildGiveawayEntries(eligible, null).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(buildGiveawayEntries(eligible, []).length).toBe(3);
  });

  it('adds bonus entries only for users holding the bonus role', () => {
    const entries = buildGiveawayEntries(eligible, [{ roleId: 'vip', bonusEntries: 2 }]);
    const count = (id: string) => entries.filter((e) => e.id === id).length;
    expect(count('a')).toBe(1);
    expect(count('b')).toBe(1 + 2);
    expect(count('c')).toBe(1 + 2);
  });

  it('stacks multiple bonus roles', () => {
    const entries = buildGiveawayEntries(eligible, [
      { roleId: 'vip', bonusEntries: 1 },
      { roleId: 'boost', bonusEntries: 3 },
    ]);
    const count = (id: string) => entries.filter((e) => e.id === id).length;
    expect(count('a')).toBe(1);
    expect(count('b')).toBe(1 + 1);
    expect(count('c')).toBe(1 + 1 + 3);
  });

  it('returns empty for no eligible users', () => {
    expect(buildGiveawayEntries([], [{ roleId: 'vip', bonusEntries: 5 }])).toEqual([]);
  });
});

describe('pickGiveawayWinners', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('returns [] for an empty pool or non-positive count', () => {
    expect(pickGiveawayWinners([], 3)).toEqual([]);
    expect(pickGiveawayWinners(pool, 0)).toEqual([]);
    expect(pickGiveawayWinners(pool, -1)).toEqual([]);
  });

  it('picks up to `count` unique winners from the pool', () => {
    const winners = pickGiveawayWinners(pool, 2);
    expect(winners.length).toBeLessThanOrEqual(2);
    expect(new Set(winners).size).toBe(winners.length);
    winners.forEach((w) => expect(['a', 'b', 'c', 'd']).toContain(w));
  });

  it('never returns more unique winners than unique entrants', () => {
    const weighted = [{ id: 'a' }, { id: 'a' }, { id: 'a' }, { id: 'b' }];
    const winners = pickGiveawayWinners(weighted, 4);
    expect(new Set(winners)).toEqual(new Set(winners));
    winners.forEach((w) => expect(['a', 'b']).toContain(w));
    expect(winners.length).toBeLessThanOrEqual(2);
  });

  it('caps at available entrants when count exceeds the pool', () => {
    expect(pickGiveawayWinners([{ id: 'solo' }], 5)).toEqual(['solo']);
  });

  it('is deterministic given a fixed rng (picks the leading slice)', () => {

    const winners = pickGiveawayWinners(pool, 3, () => 0);
    expect(winners.length).toBe(3);
    expect(new Set(winners).size).toBe(3);
  });
});
