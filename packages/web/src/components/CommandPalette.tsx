'use client';

/**
 * Ctrl/Cmd+K command palette — search-first navigation across all dashboard
 * pages. Opens via keyboard shortcut or a `cmdk:open` window event (fired by
 * the sidebar search button).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Entry = { label: string; path: string; section: string };

// [pageKey (pages namespace), path, sectionKey (sections namespace)]
const PAGES: Array<[string, string, string]> = [
  ['overview', '', 'general'], ['setup', '/setup', 'general'], ['analytics', '/analytics', 'general'],
  ['moderation', '/moderation', 'moderation'], ['automod', '/automod', 'moderation'],
  ['slowmode', '/slowmode', 'moderation'], ['anti-nuke', '/anti-nuke', 'moderation'],
  ['verification', '/verification', 'moderation'], ['reports', '/reports', 'moderation'],
  ['leveling', '/leveling', 'community'], ['leaderboard', '/leaderboard', 'community'],
  ['welcome', '/welcome', 'community'], ['reaction-roles', '/reaction-roles', 'community'],
  ['self-roles', '/self-roles', 'community'], ['birthdays', '/birthdays', 'community'],
  ['polls', '/polls', 'community'], ['suggestions', '/suggestions', 'community'],
  ['giveaways', '/giveaways', 'community'], ['starboard', '/starboard', 'community'],
  ['members', '/members', 'community'], ['invite-tracker', '/invite-tracker', 'community'],
  ['music', '/music', 'tools'], ['stats-channels', '/stats-channels', 'tools'],
  ['embeds', '/embeds', 'tools'], ['scheduled-messages', '/scheduled-messages', 'tools'],
  ['temp-voice', '/temp-voice', 'tools'], ['commands', '/commands', 'tools'],
  ['forum-management', '/forum-management', 'tools'],
  ['stream-alerts', '/stream-alerts', 'integrations'], ['twitter-feeds', '/twitter-feeds', 'integrations'],
  ['rss-feeds', '/rss-feeds', 'integrations'],
  ['monday', '/monday', 'integrations'], ['trello', '/trello', 'integrations'],
  ['logs', '/logs', 'system'], ['audit-log', '/audit-log', 'system'],
  ['announcements', '/announcements', 'system'], ['addons', '/addons', 'system'],
  ['settings', '/settings', 'system'],
];

export function CommandPalette({ guildId }: { guildId: string }) {
  const router = useRouter();
  const t = useTranslations('commandPalette');
  const tp = useTranslations('pages');
  const ts = useTranslations('sections');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries: Entry[] = useMemo(
    () => PAGES.map(([key, path, section]) => ({ label: tp(key), path: `/dashboard/${guildId}${path}`, section: ts(section) })),
    [guildId, tp, ts],
  );

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 9);
    return entries.filter((e) => e.label.toLowerCase().includes(q)).slice(0, 9);
  }, [query, entries]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setSelected(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => { setOpen(true); setQuery(''); setSelected(0); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('cmdk:open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cmdk:open', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  if (!open) return null;

  const go = (entry: Entry) => {
    setOpen(false);
    router.push(entry.path);
  };

  return (
    <div className="cmdk-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk">
        <div className="flex items-center gap-3 px-4 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, hits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
              if (e.key === 'Enter' && hits[selected]) go(hits[selected]);
            }}
            placeholder={t('placeholder')}
            className="flex-1 bg-transparent outline-none py-4 text-[15px] placeholder:text-[var(--text-muted)]"
          />
          <kbd className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <div className="px-4 py-6 text-sm text-[var(--text-muted)]">{t('noMatch', { query })}</div>
          )}
          {hits.map((h, i) => (
            <button
              key={h.path}
              onClick={() => go(h)}
              onMouseEnter={() => setSelected(i)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13.5px] text-left transition-colors ${
                i === selected ? 'bg-[var(--accent-glow)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {h.label}
              <span className="ml-auto text-[11px] text-[var(--text-muted)]">{h.section}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-4 px-4 py-2.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
          <span>{t('navigate')}</span><span>{t('openHint')}</span><span>{t('closeHint')}</span>
        </div>
      </div>
    </div>
  );
}
