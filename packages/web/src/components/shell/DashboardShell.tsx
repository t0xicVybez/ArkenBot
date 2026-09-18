'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { NAV, activeKeyForPath } from './nav';
import { cn } from '../ui/cn';

/**
 * v2 dashboard shell for the real per-guild routes (behind the beta flag).
 * Wires real guild data, route-based active state + breadcrumb, theme, and ⌘K.
 */
export function DashboardShell({
  guildId,
  guildName,
  guildIcon,
  children,
}: {
  guildId: string;
  guildName?: string;
  guildIcon?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem('v2-theme');
      if (s === 'light' || s === 'dark') setTheme(s);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('v2-theme', next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeKey = activeKeyForPath(pathname, guildId);
  const item = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find(
    (i) => i.key === activeKey,
  );
  const breadcrumb = [guildName ?? 'Server', ...(item ? [item.group, item.label] : [])];

  return (
    <div
      className="v2 h-screen overflow-hidden"
      data-theme={theme}
      style={{ background: 'var(--bg-surface)' }}
    >
      <div className="flex h-full">
        {/* mobile backdrop */}
        {mobileNav && (
          <div
            className="fixed inset-0 z-40 bg-black/55 md:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}
        {/* sidebar: static on md+, off-canvas drawer on mobile */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[var(--sidebar-w)] shrink-0 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0',
            mobileNav ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <Sidebar
            guildId={guildId}
            guildName={guildName}
            guildIcon={guildIcon}
            onOpenPalette={() => {
              setPaletteOpen(true);
              setMobileNav(false);
            }}
            onNavigate={() => setMobileNav(false)}
          />
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            breadcrumb={breadcrumb}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenSidebar={() => setMobileNav(true)}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} guildId={guildId} />
    </div>
  );
}
