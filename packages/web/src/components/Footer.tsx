/**
 * Site footer for public-facing pages.
 *
 * Two shapes:
 *  - `full`    — the landing page's three-column footer (brand, links, community)
 *                above the utility row. Needs `docsUrl`, `supportUrl`, `inviteUrl`.
 *  - `compact` — a single utility row, used on the legal/status/changelog pages.
 *                Pass `supportUrl` to include a Support link; set `maxWidthClass`
 *                to match the page's content width.
 *
 * URLs are passed in rather than read from env so this stays usable from both
 * server and client pages (mirrors how `LandingNav` receives them).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const SITE_NAME = 'Arken Bot';

/** Operational + legal links shown in the utility row of every footer. */
const UTILITY_LINKS = [
  { key: 'changelog', href: '/changelog' },
  { key: 'status', href: '/status' },
  { key: 'privacy', href: '/privacy' },
  { key: 'terms', href: '/terms' },
];

const DISCORD_ICON = (
  <svg fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.030z" />
  </svg>
);

interface FooterProps {
  variant?: 'full' | 'compact';
  /** Container max-width for the `compact` variant, to match the page content. */
  maxWidthClass?: string;
  /** When set, a Support link is shown (compact) and the community column populated (full). */
  supportUrl?: string;
  /** `full` variant only. */
  docsUrl?: string;
  inviteUrl?: string;
}

function UtilityLinks({ className }: { className: string }) {
  const t = useTranslations('footer');
  return (
    <>
      {UTILITY_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={className}>
          {t(link.key)}
        </Link>
      ))}
    </>
  );
}

export function Footer({
  variant = 'compact',
  maxWidthClass = 'max-w-3xl',
  supportUrl,
  docsUrl,
  inviteUrl,
}: FooterProps) {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  if (variant === 'full') {
    const columnLink =
      'block text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors';
    return (
      <footer className="border-t border-[var(--border)] py-10 px-6 bg-[var(--bg-base)]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-discord-blurple rounded-md flex items-center justify-center">
                  <span className="w-3.5 h-3.5 text-white">{DISCORD_ICON}</span>
                </div>
                <span className="font-semibold text-white text-sm tracking-tight">{SITE_NAME}</span>
              </div>
              <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-xs">
                {t('brandDesc')}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">{t('links')}</p>
              <div className="space-y-2">
                <Link href="/features" className={columnLink}>{t('features')}</Link>
                <Link href="/addons" className={columnLink}>{t('addons')}</Link>
                <Link href="/auth" className={columnLink}>{t('dashboard')}</Link>
                <a href={docsUrl} target="_blank" rel="noopener noreferrer" className={columnLink}>{t('docs')}</a>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">{t('community')}</p>
              <div className="space-y-2">
                <a href={supportUrl} target="_blank" rel="noopener noreferrer" className={columnLink}>{t('supportServer')}</a>
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className={columnLink}>{t('addToServer')}</a>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs">{t('rights', { year, siteName: SITE_NAME })}</span>
            <div className="flex items-center gap-4">
              <UtilityLinks className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition-colors" />
              <span className="text-[var(--text-muted)] text-xs">{t('madeWith')}</span>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  const rowLink = 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors';
  return (
    <footer className="border-t border-[var(--border)] py-8 px-6 bg-[var(--bg-base)]">
      <div className={`${maxWidthClass} mx-auto flex flex-col sm:flex-row items-center justify-between gap-2`}>
        <span className="text-[var(--text-muted)] text-xs">{t('rights', { year, siteName: SITE_NAME })}</span>
        <div className="flex items-center gap-4 text-xs">
          <UtilityLinks className={rowLink} />
          {supportUrl && (
            <a href={supportUrl} target="_blank" rel="noopener noreferrer" className={rowLink}>{t('support')}</a>
          )}
        </div>
      </div>
    </footer>
  );
}
