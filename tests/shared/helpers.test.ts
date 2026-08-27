import { describe, it, expect } from 'vitest';
import {
  xpForLevel, levelFromXp, formatDuration, parseDuration,
  formatTemplate, truncate, isSnowflake, paginate,
} from '../../packages/shared/src/index.js';

describe('xpForLevel / levelFromXp', () => {
  it('uses the exponential curve (base 100, exp 1.5)', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(4)).toBe(800);      // 100 * 4^1.5
    expect(xpForLevel(2)).toBe(282);      // floor(100 * 2.828…)
  });

  it('level 0 needs no xp; boundaries are exact', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(99)).toBe(0);
    expect(levelFromXp(100)).toBe(1);     // exactly xpForLevel(1)
    expect(levelFromXp(381)).toBe(1);     // just below 100+282
    expect(levelFromXp(382)).toBe(2);     // 100 + 282
  });

  it('is monotonic non-decreasing in xp', () => {
    let prev = 0;
    for (let xp = 0; xp < 50_000; xp += 137) {
      const lvl = levelFromXp(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
});

describe('formatDuration', () => {
  it('always returns at least one unit', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(59)).toBe('59s');
  });
  it('composes d/h/m/s and omits zero units', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(90061)).toBe('1d 1h 1m 1s');
    expect(formatDuration(3661)).toBe('1h 1m 1s');
  });
});

describe('parseDuration', () => {
  it('parses s/m/h/d/w into seconds', () => {
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('2m')).toBe(120);
    expect(parseDuration('1h')).toBe(3600);
    expect(parseDuration('7d')).toBe(604800);
    expect(parseDuration('1w')).toBe(604800);
  });
  it('is case-insensitive on the unit', () => {
    expect(parseDuration('1H')).toBe(3600);
  });
  it('returns null on bad input', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('10')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1y')).toBeNull();
    expect(parseDuration('-5m')).toBeNull();
  });
  it('round-trips with formatDuration for whole units', () => {
    for (const s of ['45s', '5m', '3h', '2d']) {
      expect(formatDuration(parseDuration(s)!)).toBe(s.replace(/(\d+)([a-z])/, '$1$2'));
    }
  });
});

describe('formatTemplate', () => {
  it('substitutes known keys, leaves unknown untouched', () => {
    expect(formatTemplate('Hi {user}!', { user: 'Alice' })).toBe('Hi Alice!');
    expect(formatTemplate('{a}+{b}={c}', { a: 1, b: 2, c: 3 })).toBe('1+2=3');
    expect(formatTemplate('level {level}', {})).toBe('level {level}');
  });
  it('handles repeated placeholders', () => {
    expect(formatTemplate('{x} {x}', { x: 'yo' })).toBe('yo yo');
  });
});

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });
  it('truncates and appends suffix within maxLength', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toBe('ab...');
    expect(out.length).toBe(5);
  });
});

describe('isSnowflake', () => {
  it('accepts 17–20 digit ids only', () => {
    expect(isSnowflake('1157354594159046658')).toBe(true);
    expect(isSnowflake('12345678901234567')).toBe(true);   // 17
    expect(isSnowflake('1234567890123456')).toBe(false);   // 16
    expect(isSnowflake('abc')).toBe(false);
    expect(isSnowflake('123456789012345678901')).toBe(false); // 21
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it('returns the right slice and metadata', () => {
    const p1 = paginate(items, 1, 10);
    expect(p1.items).toEqual([0,1,2,3,4,5,6,7,8,9]);
    expect(p1.total).toBe(25);
    expect(p1.hasMore).toBe(true);
  });
  it('flags the last page', () => {
    const p3 = paginate(items, 3, 10);
    expect(p3.items).toEqual([20,21,22,23,24]);
    expect(p3.hasMore).toBe(false);
  });
});
