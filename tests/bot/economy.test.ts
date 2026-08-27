import { describe, it, expect } from 'vitest';
import type { EconomyBalance } from '@prisma/client';
import { EconomyModule } from '../../packages/bot/src/modules/economy/EconomyModule.js';

const cfg = { currencySymbol: '🪙' };
const balance = (wallet: number, bank: number) => ({ wallet, bank } as unknown as EconomyBalance);

describe('EconomyModule.format / net', () => {
  it('formats with the currency symbol and thousands separators', () => {
    expect(EconomyModule.format(0, cfg)).toBe('🪙 0');
    expect(EconomyModule.format(1234567, cfg)).toBe('🪙 1,234,567');
  });
  it('net = wallet + bank', () => {
    expect(EconomyModule.net(balance(300, 200))).toBe(500);
  });
});

describe('EconomyModule.bankInterest', () => {
  it('is zero when rate or balance is zero', () => {
    expect(EconomyModule.bankInterest(0, { bankInterestPct: 5, bankInterestCap: 0 })).toBe(0);
    expect(EconomyModule.bankInterest(1000, { bankInterestPct: 0, bankInterestCap: 0 })).toBe(0);
  });
  it('computes floor(balance * pct/100)', () => {
    expect(EconomyModule.bankInterest(1000, { bankInterestPct: 5, bankInterestCap: 0 })).toBe(50);
    expect(EconomyModule.bankInterest(999, { bankInterestPct: 5, bankInterestCap: 0 })).toBe(49);
  });
  it('honours the cap (0 = uncapped)', () => {
    expect(EconomyModule.bankInterest(100000, { bankInterestPct: 5, bankInterestCap: 1000 })).toBe(1000);
    expect(EconomyModule.bankInterest(100000, { bankInterestPct: 5, bankInterestCap: 0 })).toBe(5000);
  });
});

describe('EconomyModule.cooldownRemaining / readyTag', () => {
  const now = 1_000_000_000_000;
  it('returns 0 when never used or window elapsed', () => {
    expect(EconomyModule.cooldownRemaining(null, 3600, now)).toBe(0);
    expect(EconomyModule.cooldownRemaining(new Date(now - 3600_000), 3600, now)).toBe(0);
  });
  it('returns remaining ms while on cooldown', () => {
    expect(EconomyModule.cooldownRemaining(new Date(now - 600_000), 3600, now)).toBe(3000_000);
  });
  it('readyTag renders a Discord relative timestamp in the future', () => {
    const tag = EconomyModule.readyTag(3000_000, now);
    expect(tag).toBe(`<t:${Math.floor((now + 3000_000) / 1000)}:R>`);
  });
});
