import { describe, it, expect } from 'vitest';
import { t } from '../../packages/bot/src/i18n/index.js';

describe('t() — the bot i18n engine', () => {
  it('resolves a known key in en-US', () => {
    expect(t('economy.wallet', 'en-US')).toBe('Wallet');
  });
  it('interpolates {vars}', () => {
    const out = t('economy.dailyDesc', 'en-US', { amount: '🪙 250' });
    expect(out).toContain('🪙 250');
    expect(out).not.toContain('{amount}');
  });
  it('returns the key unchanged when it is missing', () => {
    expect(t('does.not.exist', 'en-US')).toBe('does.not.exist');
  });
  it('falls back to en-US for an unknown locale', () => {
    expect(t('economy.wallet', 'xx-ZZ')).toBe(t('economy.wallet', 'en-US'));
  });
  it('actually translates per locale', () => {
    expect(t('economy.wallet', 'fr')).not.toBe(t('economy.wallet', 'en-US'));
    expect(t('economy.wallet', 'de')).not.toBe(t('economy.wallet', 'en-US'));
  });
  it('leaves an unprovided placeholder literal (documents the gotcha)', () => {
    expect(t('economy.dailyDesc', 'en-US')).toContain('{amount}');
  });
});
