import { describe, it, expect } from 'vitest';
import { COLORS, REDIS_KEYS, ADDON_CATEGORY_PREFIX, PERMISSION_LEVELS } from '../../packages/shared/src/index.js';

describe('COLORS', () => {
  it('are numeric hex ints usable by discord.js', () => {
    for (const v of Object.values(COLORS)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe('REDIS_KEYS', () => {
  it('namespace consistently and interpolate ids', () => {
    expect(REDIS_KEYS.GUILD_SETTINGS('123')).toBe('guild:settings:123');
    expect(REDIS_KEYS.USER_XP_COOLDOWN('g', 'u')).toBe('xp:cooldown:g:u');
  });
});

describe('misc constants', () => {
  it('addon category prefix is stable', () => {
    expect(ADDON_CATEGORY_PREFIX).toBe('addon:');
  });
  it('permission levels are strictly increasing', () => {
    const vals = Object.values(PERMISSION_LEVELS);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });
});
