'use client';

/**
 * Ctrl/Cmd+K command palette — search-first navigation across all dashboard
 * pages. Opens via keyboard shortcut or a `cmdk:open` window event (fired by
 * the sidebar search button).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

type Entry = { label: string; path: string; section: string };

const PAGES: Array<[string, string, string]> = [
  ['Overview', '', 'General'], ['Setup Wizard', '/setup', 'General'], ['Analytics', '/analytics', 'General'],
  ['Moderation', '/moderation', 'Moderation'], ['Auto-Mod', '/automod', 'Moderation'],
  ['Auto-Slowmode', '/slowmode', 'Moderation'], ['Anti-Nuke', '/anti-nuke', 'Moderation'],
  ['Verification Gate', '/verification', 'Moderation'], ['Reports', '/reports', 'Moderation'],
  ['Leveling', '/leveling', 'Community'], ['Leaderboard', '/leaderboard', 'Community'],
  ['Welcome', '/welcome', 'Community'], ['Reaction Roles', '/reaction-roles', 'Community'],
  ['Self-Roles', '/self-roles', 'Community'], ['Birthdays', '/birthdays', 'Community'],
  ['Polls', '/polls', 'Community'], ['Suggestions', '/suggestions', 'Community'],
  ['Giveaways', '/giveaways', 'Community'], ['Starboard', '/starboard', 'Community'],
  ['Members', '/members', 'Community'], ['Invite Tracker', '/invite-tracker', 'Community'],
  ['Music', '/music', 'Tools'], ['Stats Channels', '/stats-channels', 'Tools'],
  ['Embed Builder', '/embeds', 'Tools'], ['Scheduled Messages', '/scheduled-messages', 'Tools'],
  ['Temp Voice', '/temp-voice', 'Tools'], ['Commands', '/commands', 'Tools'],
  ['Forum Management', '/forum-management', 'Tools'],
  ['Stream Alerts', '/stream-alerts', 'Integrations'], ['X / Twitter Feeds', '/twitter-feeds', 'Integrations'],
  ['RSS Feeds', '/rss-feeds', 'Integrations'],
  ['Monday.com', '/monday', 'Integrations'], ['Trello', '/trello', 'Integrations'],
  ['Logs', '/logs', 'System'], ['Audit Log', '/audit-log', 'System'],
  ['Announcements', '/announcements', 'System'], ['Addon Manager', '/addons', 'System'],
  ['Settings', '/settings', 'System'],
];

export function CommandPalette({ guildId }: { guildId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries: Entry[] = useMemo(
    () => PAGES.map(([label, path, section]) => ({ label, path: `/dashboard/${guildId}${path}`, section })),
    [guildId],
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
            placeholder="Jump to a page…"
            className="flex-1 bg-transparent outline-none py-4 text-[15px] placeholder:text-[var(--text-muted)]"
          />
          <kbd className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <div className="px-4 py-6 text-sm text-[var(--text-muted)]">No pages match &ldquo;{query}&rdquo;</div>
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
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
