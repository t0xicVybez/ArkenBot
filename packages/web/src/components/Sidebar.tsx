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
  Globe,
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

interface NavItem { href: string; label: string; icon: LucideIcon }
interface NavSection { label?: string; items: NavItem[] }

/**
 * Builds the sidebar navigation tree for a guild.
 * Addon sections are only included when the corresponding addon is installed.
 */
const buildNavSections = (guildId: string, installedAddons: string[]): NavSection[] => {
  const addonItems = [
    { href: `/dashboard/${guildId}/tickets`, label: 'Tickets', icon: Ticket, addon: 'tickets' },
    { href: `/dashboard/${guildId}/counting`, label: 'Counting', icon: Hash, addon: 'counting' },
    { href: `/dashboard/${guildId}/applications`, label: 'Applications', icon: ClipboardList, addon: 'applications' },
  ].filter((item) => installedAddons.includes(item.addon));

  return [
    {
      items: [
        { href: `/dashboard/${guildId}`, label: 'Overview', icon: LayoutDashboard },
        { href: `/dashboard/${guildId}/setup`, label: 'Setup Wizard', icon: ShieldCheck },
        { href: `/dashboard/${guildId}/analytics`, label: 'Analytics', icon: LineChart },
      ],
    },
    {
      label: 'Moderation',
      items: [
        { href: `/dashboard/${guildId}/moderation`, label: 'Moderation', icon: Shield },
        { href: `/dashboard/${guildId}/automod`, label: 'Auto-Mod', icon: Bot },
        { href: `/dashboard/${guildId}/slowmode`, label: 'Auto-Slowmode', icon: Timer },
        { href: `/dashboard/${guildId}/anti-nuke`, label: 'Anti-Nuke', icon: ShieldAlert },
        { href: `/dashboard/${guildId}/verification`, label: 'Verification Gate', icon: ShieldCheck },
        { href: `/dashboard/${guildId}/reports`, label: 'Reports', icon: Flag },
      ],
    },
    {
      label: 'Community',
      items: [
        { href: `/dashboard/${guildId}/leveling`, label: 'Leveling', icon: TrendingUp },
        { href: `/dashboard/${guildId}/leaderboard`, label: 'Leaderboard', icon: BarChart },
        { href: `/dashboard/${guildId}/welcome`, label: 'Welcome', icon: MessageSquare },
        { href: `/dashboard/${guildId}/reaction-roles`, label: 'Reaction Roles', icon: Smile },
        { href: `/dashboard/${guildId}/self-roles`, label: 'Self-Roles', icon: UserCheck },
        { href: `/dashboard/${guildId}/birthdays`, label: 'Birthdays', icon: Cake },
        { href: `/dashboard/${guildId}/polls`, label: 'Polls', icon: BarChart },
        { href: `/dashboard/${guildId}/suggestions`, label: 'Suggestions', icon: MessageSquarePlus },
        { href: `/dashboard/${guildId}/giveaways`, label: 'Giveaways', icon: Gift },
        { href: `/dashboard/${guildId}/starboard`, label: 'Starboard', icon: Star },
        { href: `/dashboard/${guildId}/members`, label: 'Members', icon: Users },
        { href: `/dashboard/${guildId}/invite-tracker`, label: 'Invite Tracker', icon: UserPlus },
        { href: `/dashboard/${guildId}/voting`, label: 'Vote Rewards', icon: ThumbsUp },
      ],
    },
    {
      label: 'Content & Tools',
      items: [
        { href: `/dashboard/${guildId}/music`, label: 'Music', icon: Music },
        { href: `/dashboard/${guildId}/stats-channels`, label: 'Stats Channels', icon: BarChart2 },
        { href: `/dashboard/${guildId}/embeds`, label: 'Embed Builder', icon: Layout },
        { href: `/dashboard/${guildId}/scheduled-messages`, label: 'Scheduled Messages', icon: Clock },
        { href: `/dashboard/${guildId}/temp-voice`, label: 'Temp Voice', icon: Mic },
        { href: `/dashboard/${guildId}/commands`, label: 'Commands', icon: Terminal },
        { href: `/dashboard/${guildId}/forum-management`, label: 'Forum Management', icon: MessagesSquare },
      ],
    },
    {
      label: 'Integrations',
      items: [
        { href: `/dashboard/${guildId}/stream-alerts`, label: 'Stream Alerts', icon: Radio },
        { href: `/dashboard/${guildId}/twitter-feeds`, label: 'X / Twitter Feeds', icon: AtSign },
        { href: `/dashboard/${guildId}/reddit-feeds`, label: 'Reddit Feeds', icon: Globe },
        { href: `/dashboard/${guildId}/rss-feeds`, label: 'RSS Feeds', icon: Rss },
        { href: `/dashboard/${guildId}/monday`, label: 'Monday.com', icon: ClipboardList },
        { href: `/dashboard/${guildId}/trello`, label: 'Trello', icon: Trello },
      ],
    },
    ...(addonItems.length > 0 ? [{ label: 'Addons', items: addonItems }] : []),
    {
      label: 'System',
      items: [
        { href: `/dashboard/${guildId}/logs`, label: 'Logs', icon: FileText },
        { href: `/dashboard/${guildId}/audit-log`, label: 'Audit Log', icon: History },
        { href: `/dashboard/${guildId}/announcements`, label: 'Announcements', icon: Megaphone },
        { href: `/dashboard/${guildId}/addons`, label: 'Addon Manager', icon: Puzzle },
        { href: `/dashboard/${guildId}/settings`, label: 'Settings', icon: Settings },
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
              title="Switch server"
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
                  {guildName ?? 'Dashboard'}
                </p>
                <p className="text-[var(--text-muted)] text-[11px] truncate">
                  {memberCount ? `${memberCount.toLocaleString()} members` : 'Server settings'}
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
            Search…
            <kbd className="ml-auto text-[10px] font-mono border border-[var(--border)] rounded-[5px] px-1.5 py-px">Ctrl K</kbd>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {pins.length > 0 && (
            <div className="mb-3">
              <p className="section-title px-2 mb-1 select-none">★ Pinned</p>
              {sections.flatMap((s) => s.items).filter((i) => pins.includes(i.href)).map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <div key={`pin-${item.href}`} className="group/nav relative">
                    <Link href={item.href} onClick={handleNavClick} className={isActive ? 'nav-item-active' : 'nav-item'}>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                    <button
                      onClick={() => togglePin(item.href)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--warning)] opacity-0 group-hover/nav:opacity-100 transition-opacity"
                      title="Unpin"
                    >
                      <Star className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {sections.map((section, si) => {
            const isCollapsed = section.label ? (collapsed[section.label] ?? false) : false;
            return (
              <div key={si} className={si > 0 ? 'mt-4' : ''}>
                {section.label && (
                  <button
                    onClick={() => toggleSection(section.label!)}
                    className="w-full flex items-center justify-between px-2 mb-1 group"
                  >
                    <p className="section-title group-hover:text-[var(--text-secondary)] transition-colors select-none">
                      {section.label}
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
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                      <button
                        onClick={() => togglePin(item.href)}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity ${
                          isPinned ? 'text-[var(--warning)] opacity-100' : 'text-[var(--text-muted)] opacity-0 group-hover/nav:opacity-100'
                        }`}
                        title={isPinned ? 'Unpin' : 'Pin to top'}
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
              <span>Staff Portal</span>
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
                <p className="text-[10px] text-yellow-500/80 font-medium">Owner</p>
              )}
              {!user?.isBotOwner && user?.isStaff && (
                <p className="text-[10px] text-blue-400/80 font-medium">Staff</p>
              )}
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
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
