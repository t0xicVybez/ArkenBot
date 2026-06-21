'use client';

/**
 * Sticky navigation bar for public-facing pages.
 * Tracks scroll depth for background blur, active section via IntersectionObserver,
 * and shows a collapsible mobile drawer.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, Menu, X } from 'lucide-react';
import { clsx } from 'clsx';

interface LandingNavProps {
  docsUrl: string;
  supportUrl: string;
  inviteUrl: string;
}

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Addons', href: '/addons' },
];

/**
 * Renders the landing page navigation with scroll-aware styling,
 * active section highlighting, and a mobile drawer.
 */
export function LandingNav({ docsUrl, supportUrl, inviteUrl }: LandingNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sections = ['features'];
    const observers: IntersectionObserver[] = [];

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: '-40% 0px -55% 0px' },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleAnchorClick = (href: string) => {
    setMobileOpen(false);
    if (!href.startsWith('#')) return;
    const el = document.getElementById(href.slice(1));
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={clsx(
      'sticky top-0 z-50 border-b transition-all duration-200',
      scrolled
        ? 'border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur-xl'
        : 'border-transparent bg-[var(--bg-surface)]/60 backdrop-blur-sm',
    )}>
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-discord-blurple rounded-lg flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.030z" />
            </svg>
          </div>
          <span className="font-bold text-white tracking-tight">Arken Bot</span>
        </div>

        <div className="hidden md:flex items-center gap-1 text-sm">
          {NAV_LINKS.map((link) => {
            const isPageLink = !link.href.startsWith('#');
            const isActive = isPageLink
              ? pathname === link.href
              : activeSection === link.href.replace('#', '');
            if (isPageLink) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg transition-colors',
                    isActive
                      ? 'text-white bg-white/[0.06]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]',
                  )}
                >
                  {link.label}
                  {isActive && <span className="block h-0.5 bg-discord-blurple rounded-full mt-0.5 mx-auto" />}
                </Link>
              );
            }
            return (
              <button
                key={link.href}
                onClick={() => handleAnchorClick(link.href)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg transition-colors',
                  isActive
                    ? 'text-white bg-white/[0.06]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]',
                )}
              >
                {link.label}
                {isActive && <span className="block h-0.5 bg-discord-blurple rounded-full mt-0.5 mx-auto" />}
              </button>
            );
          })}
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-colors flex items-center gap-1.5"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-colors"
          >
            Support
          </a>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link href="/auth" className="btn-secondary text-sm py-1.5 px-4">Log In</Link>
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm py-1.5 px-4">
            Add to Server
          </a>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-1.5 px-3">
            Add Bot
          </a>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg-elevated)] backdrop-blur-md px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => {
            const isPageLink = !link.href.startsWith('#');
            if (isPageLink) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.05] transition-colors"
                >
                  {link.label}
                </Link>
              );
            }
            return (
              <button
                key={link.href}
                onClick={() => handleAnchorClick(link.href)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.05] transition-colors"
              >
                {link.label}
              </button>
            );
          })}
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.05] transition-colors"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            className="flex items-center px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.05] transition-colors"
          >
            Support
          </a>
          <div className="pt-2 border-t border-[var(--border-subtle)] flex gap-2">
            <Link href="/auth" onClick={() => setMobileOpen(false)} className="btn-secondary text-sm flex-1 justify-center">
              Log In
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
