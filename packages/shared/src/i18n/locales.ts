/**
 * Supported locales. This set mirrors Discord's own supported locales so we can
 * (a) auto-detect a user's language from `interaction.locale`, and (b) register
 * native slash-command name/description localizations that Discord will show in
 * each user's client.
 *
 * `code` is the Discord/BCP-47 locale tag; `name` is the English name; `native`
 * is the endonym shown in language pickers.
 */
export interface LocaleInfo {
  code: string;
  name: string;
  native: string;
}

// Only fully-translated locales are listed here so language pickers never offer
// a locale that would render mostly in English. `resolveLocale` still maps any
// Discord locale (e.g. `tr`, `nl`) to the closest supported one — falling back
// to en-US — so auto-detect degrades gracefully for everyone else. Add a locale
// back here once its bot + web catalogs are complete.
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
] as const;

/** The default/base locale — the source language all translations derive from. */
export const DEFAULT_LOCALE = 'en-US';

export const LOCALE_CODES: readonly string[] = LOCALES.map((l) => l.code);

const LOCALE_SET = new Set(LOCALE_CODES);

/** True if `code` is one of our supported locales (exact match). */
export function isSupportedLocale(code: string | null | undefined): boolean {
  return !!code && LOCALE_SET.has(code);
}

/**
 * Resolves an arbitrary locale-ish string to our closest supported locale.
 * Tries an exact match, then the base language (e.g. `pt-PT` -> `pt-BR`,
 * `en-CA` -> `en-US`), else falls back to DEFAULT_LOCALE.
 */
export function resolveLocale(code: string | null | undefined): string {
  if (!code) return DEFAULT_LOCALE;
  if (LOCALE_SET.has(code)) return code;
  const base = code.split('-')[0].toLowerCase();
  // exact base match (e.g. 'fr', 'de', 'ja')
  const direct = LOCALE_CODES.find((c) => c === base);
  if (direct) return direct;
  // regional variant sharing the base (e.g. 'en' -> 'en-US', 'pt' -> 'pt-BR')
  const variant = LOCALE_CODES.find((c) => c.split('-')[0].toLowerCase() === base);
  return variant ?? DEFAULT_LOCALE;
}
