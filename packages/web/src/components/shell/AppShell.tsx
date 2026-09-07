'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { SaveBar } from './SaveBar';

export function AppShell({
  activeKey,
  breadcrumb,
  dirty = false,
  onSave,
  onDiscard,
  children,
}: {
  activeKey?: string;
  breadcrumb: string[];
  dirty?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem('v2-theme');
      if (s === 'light' || s === 'dark') setTheme(s);
    } catch {
      /* storage unavailable */
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

  return (
    <div
      className="v2 h-screen overflow-hidden"
      data-theme={theme}
      style={{ background: 'var(--bg-surface)' }}
    >
      <div className="grid h-full" style={{ gridTemplateColumns: 'var(--sidebar-w) 1fr' }}>
        <Sidebar activeKey={activeKey} onOpenPalette={() => setPaletteOpen(true)} />
        <div className="relative flex min-w-0 flex-col overflow-hidden">
          <Topbar
            breadcrumb={breadcrumb}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenPalette={() => setPaletteOpen(true)}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <SaveBar dirty={dirty} onSave={onSave} onDiscard={onDiscard} />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
