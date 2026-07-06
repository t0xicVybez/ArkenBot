'use client';

/**
 * Sticky top bar for dashboard and staff layouts: breadcrumb trail on the
 * left, quick actions (search, announcements) and the user avatar on the right.
 */
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const PAGE_TITLES: Record<string, string> = {
  '': 'Overview',
  setup: 'Setup Wizard',
  analytics: 'Analytics',
  moderation: 'Moderation',
  automod: 'Auto-Mod',
  slowmode: 'Auto-Slowmode',
  'anti-nuke': 'Anti-Nuke',
  verification: 'Verification Gate',
  reports: 'Reports',
  leveling: 'Leveling',
  leaderboard: 'Leaderboard',
  welcome: 'Welcome',
  'reaction-roles': 'Reaction Roles',
  'self-roles': 'Self-Roles',
  birthdays: 'Birthdays',
  polls: 'Polls',
  suggestions: 'Suggestions',
  giveaways: 'Giveaways',
  starboard: 'Starboard',
  members: 'Members',
  'invite-tracker': 'Invite Tracker',
  music: 'Music',
  'stats-channels': 'Stats Channels',
  embeds: 'Embed Builder',
  'scheduled-messages': 'Scheduled Messages',
  'temp-voice': 'Temp Voice',
  commands: 'Commands',
  'forum-management': 'Forum Management',
  'stream-alerts': 'Stream Alerts',
  'twitter-feeds': 'X / Twitter Feeds',
  'reddit-feeds': 'Reddit Feeds',
  'rss-feeds': 'RSS Feeds',
  monday: 'Monday.com',
  trello: 'Trello',
  tickets: 'Tickets',
  counting: 'Counting',
  applications: 'Applications',
  logs: 'Logs',
  'audit-log': 'Audit Log',
  announcements: 'Announcements',
  addons: 'Addon Manager',
  settings: 'Settings',
  guilds: 'Guilds',
  users: 'Users',
  metrics: 'Metrics',
};

/** Derives the current page title from the last URL segment. */
function titleFromPath(pathname: string, rootLabel: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  // /dashboard/<id> and /staff roots
  if (parts.length <= 2 && (parts[0] === 'dashboard' || parts[0] === 'staff')) return rootLabel;
  if (PAGE_TITLES[last]) return PAGE_TITLES[last];
  return last.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface TopbarProps {
  variant?: 'guild' | 'staff';
  guildName?: string;
  guildId?: string;
}

export function Topbar({ variant = 'guild', guildName, guildId }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const title = titleFromPath(pathname ?? '', 'Overview');

  return (
    <div className="hidden md:flex sticky top-0 z-40 items-center gap-3.5 h-[54px] px-[26px] bg-[rgba(12,14,19,0.85)] backdrop-blur-[10px] border-b border-[var(--border-subtle)]">
      <div className="text-[12.5px] text-[var(--text-muted)] truncate">
        {variant === 'staff' ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[9.5px] font-extrabold tracking-[0.1em] px-2 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/30">STAFF</span>
            <b className="text-[var(--text-primary)] font-semibold">{title}</b>
          </span>
        ) : (
          <>
            {guildName && <span>{guildName} <span className="mx-1">›</span></span>}
            <b className="text-[var(--text-primary)] font-semibold">{title}</b>
          </>
        )}
      </div>
      <div className="flex-1" />
      {variant === 'guild' && (
        <>
          <button
            onClick={() => window.dispatchEvent(new Event('cmdk:open'))}
            title="Search (Ctrl K)"
            className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => guildId && router.push(`/dashboard/${guildId}/announcements`)}
            title="What's new"
            className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>
        </>
      )}
      {user?.avatar ? (
        <img
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
          alt={user.username}
          className="w-[30px] h-[30px] rounded-full"
        />
      ) : (
        <div className="w-[30px] h-[30px] rounded-full bg-[var(--accent)] grid place-items-center text-[11px] font-extrabold text-white">
          {user?.username?.slice(0, 2) ?? '??'}
        </div>
      )}
    </div>
  );
}
