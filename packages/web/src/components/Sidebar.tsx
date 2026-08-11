'use client';

/**
 * Dashboard sidebar with collapsible nav sections, per-guild navigation,
 * and a user footer with logout. Section collapsed state is persisted in localStorage.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Shield,
  Bot,
  TrendingUp,
  MessageSquare,
  Music,
  Smile,
  Puzzle,
  Ticket,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
  X,
  ShieldCheck,
  Megaphone,
  BarChart2,
  Cake,
  BarChart,
  Clock,
  Timer,
  Terminal,
  Users,
  MessageSquarePlus,
  Gift,
  Star,
  Radio,
  LineChart,
  UserPlus,
  ThumbsUp,
  Hash,
  Layout,
  UserCheck,
  AtSign,
  Rss,
  Mic,
  ShieldAlert,
  Flag,
  MessagesSquare,
  ClipboardList,
  Trello,
  History,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { useState, useEffect } from 'react';

interface SidebarProps {
  guildId?: string;
  guildName?: string;
  guildIcon?: string | null;
  memberCount?: number;
  installedAddons?: string[];
  open?: boolean;
  onClose?: () => void;
}

interface NavItem { href: string; key: string; icon: LucideIcon }
interface NavSection { labelKey?: string; items: NavItem[] }

/**
 * Builds the sidebar navigation tree for a guild.
 * Addon sections are only included when the corresponding addon is installed.
 * `key` on each item resolves against the `pages` message namespace, and
 * `labelKey` on a section resolves against the `sections` namespace.
 */
const buildNavSections = (guildId: string, installedAddons: string[]): NavSection[] => {
  const addonItems = [
    { href: `/dashboard/${guildId}/tickets`, key: 'tickets', icon: Ticket, addon: 'tickets' },
    { href: `/dashboard/${guildId}/counting`, key: 'counting', icon: Hash, addon: 'counting' },
    { href: `/dashboard/${guildId}/applications`, key: 'applications', icon: ClipboardList, addon: 'applications' },
  ].filter((item) => installedAddons.includes(item.addon));

  return [
    {
      items: [
        { href: `/dashboard/${guildId}`, key: 'overview', icon: LayoutDashboard },
        { href: `/dashboard/${guildId}/setup`, key: 'setup', icon: ShieldCheck },
        { href: `/dashboard/${guildId}/analytics`, key: 'analytics', icon: LineChart },
      ],
    },
    {
      labelKey: 'moderation',
      items: [
        { href: `/dashboard/${guildId}/moderation`, key: 'moderation', icon: Shield },
        { href: `/dashboard/${guildId}/automod`, key: 'automod', icon: Bot },
        { href: `/dashboard/${guildId}/slowmode`, key: 'slowmode', icon: Timer },
        { href: `/dashboard/${guildId}/anti-nuke`, key: 'anti-nuke', icon: ShieldAlert },
        { href: `/dashboard/${guildId}/verification`, key: 'verification', icon: ShieldCheck },
        { href: `/dashboard/${guildId}/reports`, key: 'reports', icon: Flag },
      ],
    },
    {
      labelKey: 'community',
      items: [
        { href: `/dashboard/${guildId}/leveling`, key: 'leveling', icon: TrendingUp },
        { href: `/dashboard/${guildId}/leaderboard`, key: 'leaderboard', icon: BarChart },
        { href: `/dashboard/${guildId}/welcome`, key: 'welcome', icon: MessageSquare },
        { href: `/dashboard/${guildId}/reaction-roles`, key: 'reaction-roles', icon: Smile },
        { href: `/dashboard/${guildId}/self-roles`, key: 'self-roles', icon: UserCheck },
        { href: `/dashboard/${guildId}/birthdays`, key: 'birthdays', icon: Cake },
        { href: `/dashboard/${guildId}/polls`, key: 'polls', icon: BarChart },
        { href: `/dashboard/${guildId}/suggestions`, key: 'suggestions', icon: MessageSquarePlus },
        { href: `/dashboard/${guildId}/giveaways`, key: 'giveaways', icon: Gift },
        { href: `/dashboard/${guildId}/starboard`, key: 'starboard', icon: Star },
        { href: `/dashboard/${guildId}/members`, key: 'members', icon: Users },
        { href: `/dashboard/${guildId}/invite-tracker`, key: 'invite-tracker', icon: UserPlus },
        { href: `/dashboard/${guildId}/voting`, key: 'voting', icon: ThumbsUp },
      ],
    },
    {
      labelKey: 'contentTools',
      items: [
        { href: `/dashboard/${guildId}/music`, key: 'music', icon: Music },
        { href: `/dashboard/${guildId}/stats-channels`, key: 'stats-channels', icon: BarChart2 },
        { href: `/dashboard/${guildId}/embeds`, key: 'embeds', icon: Layout },
        { href: `/dashboard/${guildId}/scheduled-messages`, key: 'scheduled-messages', icon: Clock },
        { href: `/dashboard/${guildId}/temp-voice`, key: 'temp-voice', icon: Mic },
        { href: `/dashboard/${guildId}/commands`, key: 'commands', icon: Terminal },
        { href: `/dashboard/${guildId}/forum-management`, key: 'forum-management', icon: MessagesSquare },
      ],
    },
    {
      labelKey: 'integrations',
      items: [
        { href: `/dashboard/${guildId}/stream-alerts`, key: 'stream-alerts', icon: Radio },
        { href: `/dashboard/${guildId}/twitter-feeds`, key: 'twitter-feeds', icon: AtSign },
        // Reddit Feeds hidden pending Reddit Data API approval — restore this line to re-enable.
        { href: `/dashboard/${guildId}/rss-feeds`, key: 'rss-feeds', icon: Rss },
        { href: `/dashboard/${guildId}/monday`, key: 'monday', icon: ClipboardList },
        { href: `/dashboard/${guildId}/trello`, key: 'trello', icon: Trello },
      ],
    },
    ...(addonItems.length > 0 ? [{ labelKey: 'addons', items: addonItems }] : []),
    {
      labelKey: 'system',
      items: [
        { href: `/dashboard/${guildId}/logs`, key: 'logs', icon: FileText },
        { href: `/dashboard/${guildId}/audit-log`, key: 'audit-log', icon: History },
        { href: `/dashboard/${guildId}/announcements`, key: 'announcements', icon: Megaphone },
        { href: `/dashboard/${guildId}/addons`, key: 'addons', icon: Puzzle },
        { href: `/dashboard/${guildId}/settings`, key: 'settings', icon: Settings },
      ],
    },
  ];
};

const STORAGE_KEY = 'sidebar_collapsed';
/** localStorage key for pinned favorite pages. */
const PINS_KEY = 'sidebar_pins';

/**
 * Reads persisted section-collapse state from localStorage.
 * Returns an empty object on SSR (window is not defined) or if the stored value is invalid.
 */
function loadCollapsed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

/**
 * Full-width sidebar for the per-guild dashboard.
 * On mobile, renders as an off-canvas drawer controlled by `open`/`onClose`.
 */
export function Sidebar({ guildId, guildName, guildIcon, memberCount, installedAddons = [], open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const tp = useTranslations('pages');
  const ts = useTranslations('sections');
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<string[]>([]);

  useEffect(() => {
    setCollapsed(loadCollapsed());
    try { setPins(JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]')); } catch { /* ignore */ }
  }, []);

  const togglePin = (href: string) => {
    setPins((prev) => {
      const next = prev.includes(href) ? prev.filter((p) => p !== href) : [...prev, href];
      localStorage.setItem(PINS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleSection = (label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const sections = guildId ? buildNavSections(guildId, installedAddons) : [];

  const handleNavClick = () => { onClose?.(); };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch { /* ignore */ }
    logout();
    router.push('/');
  };

  const isStaff = user?.isStaff || user?.isBotOwner;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-[250px] bg-discord-surface flex flex-col border-r transition-transform duration-200',
        'border-[var(--border-subtle)]',
        'md:relative md:translate-x-0 md:flex',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        {/* Guild switcher card */}
        <div className="px-2.5 pt-3 pb-1">
          <div className="flex items-center gap-2.5">
            <Link
              href="/dashboard"
              onClick={handleNavClick}
              title={t('switchServer')}
              className="flex items-center gap-2.5 flex-1 min-w-0 p-2.5 rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] transition-colors"
            >
              {guildIcon ? (
                <img
                  src={guildIcon}
                  alt={guildName}
                  className="w-[34px] h-[34px] rounded-[10px] flex-shrink-0 object-cover"
                />
              ) : (
                <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] grid place-items-center text-white font-extrabold text-sm flex-shrink-0">
                  {guildName?.[0] ?? 'D'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-[13px] truncate leading-tight tracking-tight">
                  {guildName ?? t('dashboardFallback')}
                </p>
                <p className="text-[var(--text-muted)] text-[11px] truncate">
                  {memberCount ? t('memberCount', { count: memberCount }) : t('serverSettings')}
                </p>
              </div>
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
            </Link>
            <button
              onClick={onClose}
              className="md:hidden p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => window.dispatchEvent(new Event('cmdk:open'))}
            className="mt-2 mb-1.5 w-full flex items-center gap-2 px-2.5 py-[7px] rounded-[9px] border border-[var(--border-subtle)] bg-white/[0.02] text-[12.5px] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-secondary)] transition-colors"
          >
            <Search className="w-3 h-3" />
            {t('search')}
            <kbd className="ml-auto text-[10px] font-mono border border-[var(--border)] rounded-[5px] px-1.5 py-px">Ctrl K</kbd>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {pins.length > 0 && (
            <div className="mb-3">
              <p className="section-title px-2 mb-1 select-none">★ {t('pinned')}</p>
              {sections.flatMap((s) => s.items).filter((i) => pins.includes(i.href)).map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <div key={`pin-${item.href}`} className="group/nav relative">
                    <Link href={item.href} onClick={handleNavClick} className={isActive ? 'nav-item-active' : 'nav-item'}>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{tp(item.key)}</span>
                    </Link>
                    <button
                      onClick={() => togglePin(item.href)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--warning)] opacity-0 group-hover/nav:opacity-100 transition-opacity"
                      title={t('unpin')}
                    >
                      <Star className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {sections.map((section, si) => {
            const isCollapsed = section.labelKey ? (collapsed[section.labelKey] ?? false) : false;
            return (
              <div key={si} className={si > 0 ? 'mt-4' : ''}>
                {section.labelKey && (
                  <button
                    onClick={() => toggleSection(section.labelKey!)}
                    className="w-full flex items-center justify-between px-2 mb-1 group"
                  >
                    <p className="section-title group-hover:text-[var(--text-secondary)] transition-colors select-none">
                      {ts(section.labelKey)}
                    </p>
                    <ChevronDown className={clsx(
                      'w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-all',
                      isCollapsed ? '-rotate-90' : '',
                    )} />
                  </button>
                )}
                {!isCollapsed && section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  const isPinned = pins.includes(item.href);
                  return (
                    <div key={item.href} className="group/nav relative">
                      <Link
                        href={item.href}
                        onClick={handleNavClick}
                        className={isActive ? 'nav-item-active' : 'nav-item'}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="flex-1 truncate">{tp(item.key)}</span>
                      </Link>
                      <button
                        onClick={() => togglePin(item.href)}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity ${
                          isPinned ? 'text-[var(--warning)] opacity-100' : 'text-[var(--text-muted)] opacity-0 group-hover/nav:opacity-100'
                        }`}
                        title={isPinned ? t('unpin') : t('pinToTop')}
                      >
                        <Star className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 py-2 border-t border-[var(--border-subtle)] space-y-0.5">
          {isStaff && (
            <Link
              href="/staff"
              onClick={handleNavClick}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors w-full"
            >
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{t('staffPortal')}</span>
            </Link>
          )}

          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg">
            {user?.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                alt={user.username}
                className="w-7 h-7 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-discord-blurple flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.username?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[var(--text-primary)] text-xs font-medium truncate leading-tight">
                {user?.username}
              </p>
              {user?.isBotOwner && (
                <p className="text-[10px] text-yellow-500/80 font-medium">{t('owner')}</p>
              )}
              {!user?.isBotOwner && user?.isStaff && (
                <p className="text-[10px] text-blue-400/80 font-medium">{t('staff')}</p>
              )}
            </div>
            <button
              onClick={handleLogout}
              title={t('logout')}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
