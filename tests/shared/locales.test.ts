import { describe, it, expect } from 'vitest';
import { resolveLocale, isSupportedLocale, LOCALES, DEFAULT_LOCALE } from '../../packages/shared/src/index.js';

const SHIPPED = ['en-US','es-ES','fr','de','pt-BR','ru','ja','ko','it','pl','zh-CN'];

describe('LOCALES registry', () => {
  it('lists exactly the 11 shipped locales', () => {
    const codes = LOCALES.map((l) => l.code).sort();
    expect(codes).toEqual([...SHIPPED].sort());
  });
  it('default locale is en-US and is in the registry', () => {
    expect(DEFAULT_LOCALE).toBe('en-US');
    expect(LOCALES.some((l) => l.code === 'en-US')).toBe(true);
  });
});

describe('isSupportedLocale', () => {
  it('accepts shipped codes, rejects others/null', () => {
    expect(isSupportedLocale('fr')).toBe(true);
    expect(isSupportedLocale('en-US')).toBe(true);
    expect(isSupportedLocale('xx')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('returns exact matches unchanged', () => {
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('pt-BR')).toBe('pt-BR');
  });
  it('maps regional variants to the shipped base/variant', () => {
    expect(resolveLocale('en-CA')).toBe('en-US');
    expect(resolveLocale('en-GB')).toBe('en-US');
    expect(resolveLocale('pt-PT')).toBe('pt-BR');
    expect(resolveLocale('es-MX')).toBe('es-ES');
  });
  it('falls back to the default for null/unknown', () => {
    expect(resolveLocale(null)).toBe('en-US');
    expect(resolveLocale(undefined)).toBe('en-US');
    expect(resolveLocale('zz')).toBe('en-US');
  });
});
