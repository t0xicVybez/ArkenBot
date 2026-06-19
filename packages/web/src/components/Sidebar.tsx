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
  ArrowLeft,
  UserPlus,
  Hash,
  Layout,
  UserCheck,
  AtSign,
  Globe,
  Rss,
  Mic,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { useState, useEffect } from 'react';

interface SidebarProps {
  guildId?: string;
  guildName?: string;
  guildIcon?: string | null;
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
  ].filter((item) => installedAddons.includes(item.addon));

  return [
    {
      items: [
        { href: `/dashboard/${guildId}`, label: 'Overview', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Moderation',
      items: [
        { href: `/dashboard/${guildId}/moderation`, label: 'Moderation', icon: Shield },
        { href: `/dashboard/${guildId}/automod`, label: 'Auto-Mod', icon: Bot },
        { href: `/dashboard/${guildId}/slowmode`, label: 'Auto-Slowmode', icon: Timer },
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
        { href: `/dashboard/${guildId}/analytics`, label: 'Analytics', icon: LineChart },
        { href: `/dashboard/${guildId}/invite-tracker`, label: 'Invite Tracker', icon: UserPlus },
      ],
    },
    {
      label: 'Tools',
      items: [
        { href: `/dashboard/${guildId}/music`, label: 'Music', icon: Music },
        { href: `/dashboard/${guildId}/stats-channels`, label: 'Stats Channels', icon: BarChart2 },
        { href: `/dashboard/${guildId}/embeds`, label: 'Embed Builder', icon: Layout },
        { href: `/dashboard/${guildId}/scheduled-messages`, label: 'Scheduled Messages', icon: Clock },
        { href: `/dashboard/${guildId}/stream-alerts`, label: 'Stream Alerts', icon: Radio },
        { href: `/dashboard/${guildId}/temp-voice`, label: 'Temp Voice', icon: Mic },
        { href: `/dashboard/${guildId}/twitter-feeds`, label: 'X / Twitter Feeds', icon: AtSign },
        { href: `/dashboard/${guildId}/reddit-feeds`, label: 'Reddit Feeds', icon: Globe },
        { href: `/dashboard/${guildId}/rss-feeds`, label: 'RSS Feeds', icon: Rss },
        { href: `/dashboard/${guildId}/commands`, label: 'Commands', icon: Terminal },
      ],
    },
    ...(addonItems.length > 0 ? [{ label: 'Addons', items: addonItems }] : []),
    {
      label: 'System',
      items: [
        { href: `/dashboard/${guildId}/logs`, label: 'Logs', icon: FileText },
        { href: `/dashboard/${guildId}/announcements`, label: 'Announcements', icon: Megaphone },
        { href: `/dashboard/${guildId}/addons`, label: 'Addon Manager', icon: Puzzle },
        { href: `/dashboard/${guildId}/settings`, label: 'Settings', icon: Settings },
      ],
    },
  ];
};

/** localStorage key used to persist which nav sections are collapsed. */
const STORAGE_KEY = 'sidebar_collapsed';

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
export function Sidebar({ guildId, guildName, guildIcon, installedAddons = [], open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => { setCollapsed(loadCollapsed()); }, []);

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
    const refreshToken = useAuth.getState().refreshToken;
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch { /* ignore */ }
    logout();
    router.push('/');
  };

  const isStaff = user?.isStaff || user?.isBotOwner;

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={onClose} />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-60 bg-discord-darker-bg flex flex-col border-r border-white/[0.06] transition-transform duration-200',
        'md:relative md:translate-x-0 md:flex',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {guildIcon ? (
                <img src={guildIcon} alt={guildName} className="w-8 h-8 rounded-full flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-discord-blurple flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {guildName?.[0] ?? 'D'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate leading-tight">{guildName ?? 'Dashboard'}</p>
                <p className="text-gray-500 text-xs">Server Settings</p>
              </div>
            </div>
            <button onClick={onClose} className="md:hidden text-gray-500 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          <Link
            href="/dashboard"
            onClick={handleNavClick}
            className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            All Servers
          </Link>
        </div>

        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {sections.map((section, si) => {
            const isCollapsed = section.label ? (collapsed[section.label] ?? false) : false;
            return (
              <div key={si} className={si > 0 ? 'mt-4' : ''}>
                {section.label && (
                  <button
                    onClick={() => toggleSection(section.label!)}
                    className="w-full flex items-center justify-between px-2 mb-1 group"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 group-hover:text-gray-400 transition-colors select-none">
                      {section.label}
                    </p>
                    <ChevronDown className={clsx(
                      'w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-all',
                      isCollapsed ? '-rotate-90' : '',
                    )} />
                  </button>
                )}
                {!isCollapsed && section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleNavClick}
                      className={clsx(
                        'flex items-center gap-2.5 px-2.5 py-2 sm:py-1.5 rounded-md text-[13px] font-medium transition-colors',
                        isActive
                          ? 'bg-discord-blurple/15 text-white'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]',
                      )}
                    >
                      <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', isActive ? 'text-discord-blurple' : '')} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="px-2 py-2 border-t border-white/[0.06] space-y-0.5">
          {isStaff && (
            <Link
              href="/staff"
              onClick={handleNavClick}
              className="flex items-center gap-2.5 px-2.5 py-2 sm:py-1.5 rounded-md text-[13px] font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors w-full"
            >
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Staff Portal</span>
            </Link>
          )}

          <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md">
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
              <p className="text-gray-200 text-xs font-medium truncate leading-tight">{user?.username}</p>
              {user?.isBotOwner && <p className="text-[10px] text-yellow-500/80 font-medium">Owner</p>}
              {!user?.isBotOwner && user?.isStaff && <p className="text-[10px] text-blue-400/80 font-medium">Staff</p>}
            </div>
            <button onClick={handleLogout} title="Logout" className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
