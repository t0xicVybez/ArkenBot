'use client';

import { Search, Bell, Sun, Moon } from 'lucide-react';

export function Topbar({
  breadcrumb,
  theme,
  onToggleTheme,
  onOpenPalette,
}: {
  breadcrumb: string[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <header className="flex h-[var(--topbar-h)] flex-none items-center gap-3 border-b border-[var(--border)] px-6">
      <nav className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
        {breadcrumb.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-[var(--text-muted)]">›</span>}
            <span className={i === breadcrumb.length - 1 ? 'font-semibold text-[var(--text-primary)]' : ''}>
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        onClick={onOpenPalette}
        className="hidden items-center gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[13px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        Search…
        <kbd
          className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[11px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          ⌘K
        </kbd>
      </button>

      <button
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      >
        {theme === 'dark' ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
      </button>

      <button
        aria-label="Notifications"
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      >
        <Bell className="h-[17px] w-[17px]" />
      </button>

      <span
        className="h-[34px] w-[34px] rounded-[9px]"
        style={{ background: 'linear-gradient(135deg,#c94b6b,#8a5cf6)' }}
      />
    </header>
  );
}
