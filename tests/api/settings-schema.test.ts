import { describe, it, expect } from 'vitest';
import {
  GuildSettingsPatchSchema,
  AutoModPatchSchema,
  WelcomePatchSchema,
  normalizeEmoji,
} from '../../packages/api/src/routes/settings.schemas.js';

/**
 * These schemas are the gate every settings write passes through. `.strict()`
 * means an unknown key is rejected outright — that guard has silently 400'd real
 * PATCHes before, so it (and the range/format rules) are worth locking down.
 */

describe('GuildSettingsPatchSchema', () => {
  it('accepts a valid partial patch', () => {
    expect(GuildSettingsPatchSchema.safeParse({ moderationEnabled: true }).success).toBe(true);
    expect(GuildSettingsPatchSchema.safeParse({}).success).toBe(true); // empty patch is valid
    expect(GuildSettingsPatchSchema.safeParse({ logChannelId: null }).success).toBe(true);
  });

  it('rejects unknown keys (.strict)', () => {
    expect(GuildSettingsPatchSchema.safeParse({ notARealField: 1 }).success).toBe(false);
    // a valid field alongside an unknown one still fails the whole body
    expect(GuildSettingsPatchSchema.safeParse({ moderationEnabled: true, foo: 'bar' }).success).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(GuildSettingsPatchSchema.safeParse({ moderationEnabled: 'yes' }).success).toBe(false);
    expect(GuildSettingsPatchSchema.safeParse({ voiceXpPerMinute: 'ten' }).success).toBe(false);
  });

  it('enforces numeric ranges', () => {
    expect(GuildSettingsPatchSchema.safeParse({ voiceXpPerMinute: 0 }).success).toBe(false);
    expect(GuildSettingsPatchSchema.safeParse({ voiceXpPerMinute: 101 }).success).toBe(false);
    expect(GuildSettingsPatchSchema.safeParse({ voiceXpPerMinute: 50 }).success).toBe(true);
    expect(GuildSettingsPatchSchema.safeParse({ prestigeLevel: 9 }).success).toBe(false);
    expect(GuildSettingsPatchSchema.safeParse({ prestigeLevel: 10 }).success).toBe(true);
  });

  it('validates hex colours', () => {
    expect(GuildSettingsPatchSchema.safeParse({ accentColor: '#5865F2' }).success).toBe(true);
    expect(GuildSettingsPatchSchema.safeParse({ accentColor: 'red' }).success).toBe(false);
    expect(GuildSettingsPatchSchema.safeParse({ accentColor: '#zzz' }).success).toBe(false);
    // loggingColor uniquely permits an empty string (meaning "unset")
    expect(GuildSettingsPatchSchema.safeParse({ loggingColor: '' }).success).toBe(true);
    expect(GuildSettingsPatchSchema.safeParse({ accentColor: '' }).success).toBe(false);
  });
});

describe('AutoModPatchSchema', () => {
  it('accepts valid config and enums', () => {
    expect(AutoModPatchSchema.safeParse({ raidAction: 'kick' }).success).toBe(true);
    expect(AutoModPatchSchema.safeParse({ filterAction: 'ban', filteredWords: ['a', 'b'] }).success).toBe(true);
  });

  it('rejects out-of-range thresholds and bad enums', () => {
    expect(AutoModPatchSchema.safeParse({ antiSpamThreshold: 1 }).success).toBe(false);
    expect(AutoModPatchSchema.safeParse({ antiSpamThreshold: 2 }).success).toBe(true);
    expect(AutoModPatchSchema.safeParse({ antiSpamThreshold: 51 }).success).toBe(false);
    expect(AutoModPatchSchema.safeParse({ raidAction: 'nuke' }).success).toBe(false);
  });

  it('caps the filtered-words list size and word length', () => {
    expect(AutoModPatchSchema.safeParse({ filteredWords: Array(201).fill('x') }).success).toBe(false);
    expect(AutoModPatchSchema.safeParse({ filteredWords: ['x'.repeat(101)] }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(AutoModPatchSchema.safeParse({ somethingElse: true }).success).toBe(false);
  });
});

describe('WelcomePatchSchema', () => {
  it('accepts a valid patch and enforces the message length cap', () => {
    expect(WelcomePatchSchema.safeParse({ welcomeMessage: 'hi' }).success).toBe(true);
    expect(WelcomePatchSchema.safeParse({ welcomeMessage: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('rejects unknown keys', () => {
    expect(WelcomePatchSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});

describe('normalizeEmoji', () => {
  it('collapses custom emoji to name:id', () => {
    expect(normalizeEmoji('<:pepe:123456789>')).toBe('pepe:123456789');
  });
  it('collapses animated custom emoji to name:id', () => {
    expect(normalizeEmoji('<a:spin:987654321>')).toBe('spin:987654321');
  });
  it('strips the FE0F variation selector from unicode emoji', () => {
    expect(normalizeEmoji('⭐️')).toBe('⭐'); // ⭐️ → ⭐
  });
  it('passes a plain unicode emoji through, trimmed', () => {
    expect(normalizeEmoji('  🎫 ')).toBe('🎫');
  });
});
