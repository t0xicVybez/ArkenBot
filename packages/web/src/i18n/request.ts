import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { resolveLocale, DEFAULT_LOCALE } from '@arkenbot/shared';

/**
 * next-intl request config (no locale-prefixed routing). The active locale comes
 * from the `arken_locale` cookie, which the language switcher sets and keeps in
 * sync with the user's UserPreferences (so the bot and dashboard agree). Falls
 * back to the default locale, and to the default catalog if a locale file is
 * missing.
 */
function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)
        ? deepMerge(b as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

// Load the locale merged over the en-US base so any key a translation is missing
// falls back to English instead of breaking the page. Partial translations are
// therefore always safe to ship.
async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const base = (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default as Record<string, unknown>;
  if (locale === DEFAULT_LOCALE) return base;
  try {
    const loc = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>;
    return deepMerge(base, loc);
  } catch {
    return base;
  }
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get('arken_locale')?.value ?? DEFAULT_LOCALE);
  return { locale, messages: await loadMessages(locale) };
});
