'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { LOCALES } from '@arkenbot/shared';
import api from '@/lib/api';

/**
 * Compact language picker for the public navigation bar. A globe button opens a
 * dropdown of shipped locales. Selecting one sets the `arken_locale` cookie (so
 * SSR renders the chosen locale), best-effort persists to the signed-in user's
 * preferences (silently ignored when logged out), then refreshes to apply.
 * The full labeled variant used on the settings page is `LanguageSwitcher`.
 */
export function LanguageMenu({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function change(code: string) {
    setOpen(false);
    if (code === locale) return;
    document.cookie = `arken_locale=${code}; path=/; max-age=31536000; samesite=lax`;
    void api.patch('/me/language', { language: code }).catch(() => {});
    startTransition(() => router.refresh());
  }

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-label={t('label')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-colors disabled:opacity-60"
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{current?.native}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 min-w-[11rem] max-h-[70vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-xl z-50"
        >
          {LOCALES.map((l) => {
            const active = l.code === locale;
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => change(l.code)}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors',
                  active
                    ? 'text-white bg-white/[0.06]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]',
                )}
              >
                <span>{l.native} <span className="text-[var(--text-muted)]">({l.name})</span></span>
                {active && <Check className="w-3.5 h-3.5 shrink-0 text-discord-blurple" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
