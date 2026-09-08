'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { NAV, activeKeyForPath } from './nav';

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
      <div className="grid h-full" style={{ gridTemplateColumns: 'var(--sidebar-w) 1fr' }}>
        <Sidebar
          guildId={guildId}
          guildName={guildName}
          guildIcon={guildIcon}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <div className="relative flex min-w-0 flex-col overflow-hidden">
          <Topbar
            breadcrumb={breadcrumb}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenPalette={() => setPaletteOpen(true)}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} guildId={guildId} />
    </div>
  );
}
