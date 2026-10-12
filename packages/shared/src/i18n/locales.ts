
export interface LocaleInfo {
  code: string;
  name: string;
  native: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en-US', name: 'English (US)', native: 'English (US)' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '中文' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português do Brasil' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'es-ES', name: 'Spanish', native: 'Español' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
] as const;

export const DEFAULT_LOCALE = 'en-US';

export const LOCALE_CODES: readonly string[] = LOCALES.map((l) => l.code);

const LOCALE_SET = new Set(LOCALE_CODES);

export function isSupportedLocale(code: string | null | undefined): boolean {
  return !!code && LOCALE_SET.has(code);
}

export function resolveLocale(code: string | null | undefined): string {
  if (!code) return DEFAULT_LOCALE;
  if (LOCALE_SET.has(code)) return code;
  const base = code.split('-')[0].toLowerCase();

  const direct = LOCALE_CODES.find((c) => c === base);
  if (direct) return direct;

  const variant = LOCALE_CODES.find((c) => c.split('-')[0].toLowerCase() === base);
  return variant ?? DEFAULT_LOCALE;
}
