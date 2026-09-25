'use client';

import { Search, Bell, Sun, Moon, Menu } from 'lucide-react';

export function Topbar({
  breadcrumb,
  theme,
  onToggleTheme,
  onOpenPalette,
  onOpenSidebar,
}: {
  breadcrumb: string[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onOpenSidebar?: () => void;
}) {
  return (
    <header className="flex h-(--topbar-h) flex-none items-center gap-3 border-b border-(--border) px-4 md:px-6">
      {onOpenSidebar && (
        <button
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="-ml-1 grid h-[34px] w-[34px] place-items-center rounded-[9px] text-(--text-secondary) hover:bg-(--bg-hover) md:hidden"
        >
          <Menu className="h-[19px] w-[19px]" />
        </button>
      )}
      <nav className="flex items-center gap-2 text-[13px] text-(--text-secondary)">
        {breadcrumb.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-(--text-muted)">›</span>}
            <span className={i === breadcrumb.length - 1 ? 'font-semibold text-(--text-primary)' : ''}>
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        onClick={onOpenPalette}
        className="hidden items-center gap-2 rounded-(--r) border border-(--border) bg-(--bg-card) px-3 py-1.5 text-[13px] text-(--text-muted) hover:bg-(--bg-hover) sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        Search…
        <kbd
          className="rounded-[6px] border border-(--border) bg-(--bg-base) px-1.5 py-0.5 text-[11px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          ⌘K
        </kbd>
      </button>

      <button
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-(--border) bg-(--bg-card) text-(--text-secondary) hover:bg-(--bg-hover)"
      >
        {theme === 'dark' ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
      </button>

      <button
        aria-label="Notifications"
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-(--border) bg-(--bg-card) text-(--text-secondary) hover:bg-(--bg-hover)"
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
