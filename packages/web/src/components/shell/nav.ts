import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid, BarChart3, Wand2, Shield, Bot, ShieldAlert, ShieldCheck, Flag, Gavel, ScrollText,
  TrendingUp, Trophy, Hand, SmilePlus, Tags, Cake, Vote, Lightbulb, Gift, Coins, Star, Link2,
  ThumbsUp, Hash, Music, Activity, Code2, CalendarClock, Mic, Terminal, MessageSquare, Users,
  Rss, Radio, Megaphone, Puzzle, Ticket, ClipboardList, SquareKanban, Trello,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Real dashboard route segment (''=overview). Used to build /dashboard/<guildId>/<slug>. */
  slug: string;
  /** Static fallback href for the design previews (no guildId). */
  href: string;
  badge?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Build the real route for a nav item, or the static preview href when no guild. */
export function hrefFor(item: NavItem, guildId?: string): string {
  if (!guildId) return item.href;
  return item.slug ? `/dashboard/${guildId}/${item.slug}` : `/dashboard/${guildId}`;
}

/** Which nav item matches the current pathname (for active state). */
export function activeKeyForPath(pathname: string, guildId?: string): string | undefined {
  if (!guildId) return undefined;
  const base = `/dashboard/${guildId}`;
  if (pathname === base || pathname === `${base}/`) return 'overview';
  const rest = pathname.startsWith(base + '/') ? pathname.slice(base.length + 1) : '';
  const seg = rest.split('/')[0];
  const all = NAV.flatMap((g) => g.items);
  return all.find((i) => i.slug && i.slug === seg)?.key;
}

const it = (key: string, label: string, icon: LucideIcon, slug: string, href = '#', badge?: string): NavItem => ({ key, label, icon, slug, href, badge });

/** The regrouped v2 information architecture (30+ pages → 5 buckets). */
export const NAV: NavGroup[] = [
  {
    label: 'Home',
    items: [
      it('overview', 'Overview', LayoutGrid, '', '/v2-app'),
      it('analytics', 'Analytics', BarChart3, 'analytics', '/v2-app/analytics'),
      it('setup', 'Setup Wizard', Wand2, 'setup'),
    ],
  },
  {
    label: 'Safety',
    items: [
      it('moderation', 'Moderation', Shield, 'moderation'),
      it('automod', 'Auto-Mod', Bot, 'automod', '/v2-app/automod'),
      it('antinuke', 'Anti-Nuke', ShieldAlert, 'anti-nuke'),
      it('verification', 'Verification', ShieldCheck, 'verification'),
      it('reports', 'Reports', Flag, 'reports', '#', '2'),
      it('appeals', 'Appeals', Gavel, 'appeals'),
      it('logs', 'Logs', ScrollText, 'logs'),
    ],
  },
  {
    label: 'Community',
    items: [
      it('leveling', 'Leveling', TrendingUp, 'leveling'),
      it('leaderboard', 'Leaderboard', Trophy, 'leaderboard'),
      it('welcome', 'Welcome', Hand, 'welcome'),
      it('reactionroles', 'Reaction Roles', SmilePlus, 'reaction-roles'),
      it('selfroles', 'Self Roles', Tags, 'self-roles'),
      it('birthdays', 'Birthdays', Cake, 'birthdays'),
      it('polls', 'Polls', Vote, 'polls'),
      it('suggestions', 'Suggestions', Lightbulb, 'suggestions'),
      it('giveaways', 'Giveaways', Gift, 'giveaways'),
      it('economy', 'Economy', Coins, 'economy'),
      it('starboard', 'Starboard', Star, 'starboard'),
      it('invites', 'Invite Tracker', Link2, 'invite-tracker'),
      it('voterewards', 'Vote Rewards', ThumbsUp, 'voting'),
      it('counting', 'Counting', Hash, 'counting'),
    ],
  },
  {
    label: 'Content & Tools',
    items: [
      it('music', 'Music', Music, 'music'),
      it('stats', 'Stats Channels', Activity, 'stats-channels'),
      it('embeds', 'Embed Builder', Code2, 'embeds'),
      it('scheduled', 'Scheduled Messages', CalendarClock, 'scheduled-messages'),
      it('tempvoice', 'Temp Voice', Mic, 'temp-voice'),
      it('commands', 'Commands', Terminal, 'commands'),
      it('forum', 'Forum Management', MessageSquare, 'forum-management'),
      it('members', 'Members', Users, 'members'),
      it('rss', 'RSS Feeds', Rss, 'rss-feeds'),
      it('streams', 'Stream Alerts', Radio, 'stream-alerts'),
      it('announcements', 'Announcements', Megaphone, 'announcements'),
    ],
  },
  {
    label: 'Extend',
    items: [
      it('addons', 'Add-ons', Puzzle, 'addons', '#', '7'),
      it('tickets', 'Tickets', Ticket, 'tickets'),
      it('applications', 'Applications', ClipboardList, 'applications'),
      it('monday', 'Monday.com', SquareKanban, 'monday'),
      it('trello', 'Trello', Trello, 'trello'),
    ],
  },
];
