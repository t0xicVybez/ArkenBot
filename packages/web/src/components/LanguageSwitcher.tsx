'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES } from '@arkenbot/shared';
import api from '@/lib/api';

/**
 * Language picker. Sets the `arken_locale` cookie (so SSR renders the chosen
 * locale), persists the choice to the user's UserPreferences via the API (so the
 * bot replies in the same language), then refreshes to apply. Falls through
 * silently if the persist call fails — the cookie still switches the UI.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(code: string) {
    document.cookie = `arken_locale=${code}; path=/; max-age=31536000; samesite=lax`;
    void api.patch('/me/language', { language: code }).catch(() => {});
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--text-primary)]">{t('label')}</span>
      <span className="text-xs text-[var(--text-secondary)]">{t('description')}</span>
      <select
        value={locale}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text-primary)] disabled:opacity-60"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native} ({l.name})
          </option>
        ))}
      </select>
    </label>
  );
}
