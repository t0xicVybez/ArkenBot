'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, CornerDownLeft } from 'lucide-react';
import { NAV } from './nav';
import { cn } from '../ui/cn';

const PAGES = NAV.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label })));

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return PAGES.slice(0, 7);
    return PAGES.filter(
      (p) => p.label.toLowerCase().includes(term) || p.group.toLowerCase().includes(term),
    ).slice(0, 8);
  }, [q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[140px]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[640px] overflow-hidden rounded-[16px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[var(--sh-pop)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <Search className="h-5 w-5 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to anything…"
            className="flex-1 bg-transparent text-[16px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd
            className="rounded-[6px] border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            esc
          </kbd>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          <div className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[1.2px] text-[var(--text-muted)]">
            Pages
          </div>
          {results.map((p, i) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.key}
                href={p.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px]',
                  i === 0
                    ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
                )}
              >
                <span
                  className={cn(
                    'grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px]',
                    i === 0 ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {p.label}
                <span className="ml-1 text-[12px] text-[var(--text-muted)]">{p.group}</span>
                {i === 0 && <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />}
              </Link>
            );
          })}
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">
              No matches for “{q}”.
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2.5 text-[11.5px] text-[var(--text-muted)]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⌘K toggle</span>
          <span className="ml-auto">ArkenBot command menu</span>
        </div>
      </div>
    </div>
  );
}
