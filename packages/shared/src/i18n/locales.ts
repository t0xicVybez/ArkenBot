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

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en-US', name: 'English (US)', native: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)', native: 'English (UK)' },
  { code: 'bg', name: 'Bulgarian', native: 'български' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski' },
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' },
  { code: 'no', name: 'Norwegian', native: 'Norsk' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português do Brasil' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'es-ES', name: 'Spanish', native: 'Español' },
  { code: 'es-419', name: 'Spanish (LATAM)', native: 'Español (Latinoamérica)' },
  { code: 'sv-SE', name: 'Swedish', native: 'Svenska' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
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
