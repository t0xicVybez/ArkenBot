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
async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch {
    return (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;
  }
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get('arken_locale')?.value ?? DEFAULT_LOCALE);
  return { locale, messages: await loadMessages(locale) };
});
