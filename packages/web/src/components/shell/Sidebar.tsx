'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Search, ChevronsUpDown } from 'lucide-react';
import { NAV } from './nav';
import { cn } from '../ui/cn';

export function Sidebar({
  activeKey,
  onOpenPalette,
}: {
  activeKey?: string;
  onOpenPalette?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (g: string) => setCollapsed((c) => ({ ...c, [g]: !c[g] }));

  return (
    <aside className="flex h-full flex-col gap-3.5 border-r border-[var(--border)] bg-[var(--bg-card)] p-3">
      {/* brand */}
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <div
          className="grid h-[30px] w-[30px] place-items-center rounded-[9px] font-bold text-[var(--accent-contrast)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', fontFamily: 'var(--font-display)', boxShadow: '0 0 0 1px var(--accent-glow), var(--sh-glow)' }}
        >
          A
        </div>
        <span className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          ArkenBot
        </span>
      </div>

      {/* server switcher */}
      <button className="flex items-center gap-2.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)]">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[var(--bg-hover)] text-[11px] font-bold text-[var(--text-secondary)]">
          RE
        </span>
        <span className="flex-1 text-[13px] font-semibold">Ronin Empire</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      </button>

      {/* search / command */}
      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-[13px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
      >
        <Search className="h-3.5 w-3.5" />
        Search…
        <kbd
          className="ml-auto rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          ⌘K
        </kbd>
      </button>

      {/* nav */}
      <nav className="-mr-1 flex flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {NAV.map((group) => {
          const isCollapsed = collapsed[group.label];
          return (
            <div key={group.label}>
              <button
                onClick={() => toggle(group.label)}
                className="flex w-full items-center gap-1 px-2 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[1.2px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                {group.label}
                <ChevronDown
                  className={cn('ml-auto h-3 w-3 transition-transform', isCollapsed && '-rotate-90')}
                />
              </button>
              {!isCollapsed &&
                group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.key === activeKey;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-[9px] px-2.5 py-[7px] text-[13.5px] font-medium transition-colors',
                        active
                          ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      <Icon className="h-[17px] w-[17px] flex-none" />
                      {item.label}
                      {item.badge && (
                        <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      {/* user */}
      <div className="flex items-center gap-2.5 border-t border-[var(--border)] pt-3">
        <span
          className="h-[30px] w-[30px] rounded-[8px]"
          style={{ background: 'linear-gradient(135deg,#c94b6b,#8a5cf6)' }}
        />
        <div className="flex-1">
          <div className="text-[13px] font-semibold">RagingTrucker</div>
          <div className="text-[11px] text-[var(--accent)]">Owner</div>
        </div>
      </div>
    </aside>
  );
}
