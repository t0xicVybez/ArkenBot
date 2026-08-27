import { describe, it, expect } from 'vitest';
import { classifyError, describeError } from '../../packages/shared/src/index.js';

describe('classifyError — Discord codes', () => {
  it('50013 → permissions with a hint', () => {
    const c = classifyError({ code: 50013 });
    expect(c.category).toBe('permissions');
    expect(c.hint).toBeTruthy();
    expect(c.code).toBe(50013);
  });
  it("50007 → dm-blocked (user's setting)", () => {
    expect(classifyError({ code: 50007 }).category).toBe('dm-blocked');
  });
  it('10062 → interaction (expired)', () => {
    expect(classifyError({ code: 10062 }).category).toBe('interaction');
  });
  it('reads the code from rawError / status shapes', () => {
    expect(classifyError({ rawError: { code: 50013 } }).category).toBe('permissions');
    expect(classifyError({ status: 50007 }).category).toBe('dm-blocked');
  });
});

describe('classifyError — fallback', () => {
  it('unknown error keeps the first line of the message', () => {
    const c = classifyError(new Error('boom\nstack line'));
    expect(c.category).toBe('unknown');
    expect(c.summary).toBe('boom');
  });
  it('always returns a category + summary for any value', () => {
    for (const v of [undefined, null, 'str', 42, {}]) {
      const c = classifyError(v as unknown);
      expect(c.category).toBeTruthy();
      expect(typeof c.summary).toBe('string');
    }
  });
});

describe('describeError', () => {
  it('formats as [category] summary', () => {
    expect(describeError({ code: 50013 })).toMatch(/^\[permissions\] /);
  });
});
