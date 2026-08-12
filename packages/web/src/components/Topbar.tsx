'use client';

/**
 * Sticky top bar for dashboard and staff layouts: breadcrumb trail on the
 * left, quick actions (search, announcements) and the user avatar on the right.
 */
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';

/** Derives the current page slug (a `pages` message key) from the URL. */
function slugFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  // /dashboard/<id> and /staff roots resolve to the Overview page
  if (parts.length <= 2 && (parts[0] === 'dashboard' || parts[0] === 'staff')) return 'overview';
  return last;
}

/** Title-cases an unknown slug as a fallback (e.g. `foo-bar` → `Foo Bar`). */
function humanize(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface TopbarProps {
  variant?: 'guild' | 'staff';
  guildName?: string;
  guildId?: string;
}

export function Topbar({ variant = 'guild', guildName, guildId }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('topbar');
  const tp = useTranslations('pages');
  const { user } = useAuth();
  const slug = slugFromPath(pathname ?? '');
  const title = tp.has(slug) ? tp(slug) : humanize(slug);

  return (
    <div className="hidden md:flex sticky top-0 z-40 items-center gap-3.5 h-[54px] px-[26px] bg-[rgba(12,14,19,0.85)] backdrop-blur-[10px] border-b border-[var(--border-subtle)]">
      <div className="text-[12.5px] text-[var(--text-muted)] truncate">
        {variant === 'staff' ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[9.5px] font-extrabold tracking-[0.1em] px-2 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/30">{t('staffBadge')}</span>
            <b className="text-[var(--text-primary)] font-semibold">{title}</b>
          </span>
        ) : (
          <>
            {guildName && <span>{guildName} <span className="mx-1">›</span></span>}
            <b className="text-[var(--text-primary)] font-semibold">{title}</b>
          </>
        )}
      </div>
      <div className="flex-1" />
      {variant === 'guild' && (
        <>
          <button
            onClick={() => window.dispatchEvent(new Event('cmdk:open'))}
            title={t('searchTitle')}
            className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => guildId && router.push(`/dashboard/${guildId}/announcements`)}
            title={t('whatsNew')}
            className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>
        </>
      )}
      {user?.avatar ? (
        <img
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
          alt={user.username}
          className="w-[30px] h-[30px] rounded-full"
        />
      ) : (
        <div className="w-[30px] h-[30px] rounded-full bg-[var(--accent)] grid place-items-center text-[11px] font-extrabold text-white">
          {user?.username?.slice(0, 2) ?? '??'}
        </div>
      )}
    </div>
  );
}
