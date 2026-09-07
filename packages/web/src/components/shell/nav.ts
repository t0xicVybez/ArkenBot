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
  href: string;
  badge?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The regrouped v2 information architecture (30+ pages → 5 buckets). */
export const NAV: NavGroup[] = [
  {
    label: 'Home',
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutGrid, href: '/v2-app' },
      { key: 'analytics', label: 'Analytics', icon: BarChart3, href: '/v2-app/analytics' },
      { key: 'setup', label: 'Setup Wizard', icon: Wand2, href: '#' },
    ],
  },
  {
    label: 'Safety',
    items: [
      { key: 'moderation', label: 'Moderation', icon: Shield, href: '#' },
      { key: 'automod', label: 'Auto-Mod', icon: Bot, href: '/v2-app/automod' },
      { key: 'antinuke', label: 'Anti-Nuke', icon: ShieldAlert, href: '#' },
      { key: 'verification', label: 'Verification', icon: ShieldCheck, href: '#' },
      { key: 'reports', label: 'Reports', icon: Flag, href: '#', badge: '2' },
      { key: 'appeals', label: 'Appeals', icon: Gavel, href: '#' },
      { key: 'logs', label: 'Logs', icon: ScrollText, href: '#' },
    ],
  },
  {
    label: 'Community',
    items: [
      { key: 'leveling', label: 'Leveling', icon: TrendingUp, href: '#' },
      { key: 'leaderboard', label: 'Leaderboard', icon: Trophy, href: '#' },
      { key: 'welcome', label: 'Welcome', icon: Hand, href: '#' },
      { key: 'reactionroles', label: 'Reaction Roles', icon: SmilePlus, href: '#' },
      { key: 'selfroles', label: 'Self Roles', icon: Tags, href: '#' },
      { key: 'birthdays', label: 'Birthdays', icon: Cake, href: '#' },
      { key: 'polls', label: 'Polls', icon: Vote, href: '#' },
      { key: 'suggestions', label: 'Suggestions', icon: Lightbulb, href: '#' },
      { key: 'giveaways', label: 'Giveaways', icon: Gift, href: '#' },
      { key: 'economy', label: 'Economy', icon: Coins, href: '#' },
      { key: 'starboard', label: 'Starboard', icon: Star, href: '#' },
      { key: 'invites', label: 'Invite Tracker', icon: Link2, href: '#' },
      { key: 'voterewards', label: 'Vote Rewards', icon: ThumbsUp, href: '#' },
      { key: 'counting', label: 'Counting', icon: Hash, href: '#' },
    ],
  },
  {
    label: 'Content & Tools',
    items: [
      { key: 'music', label: 'Music', icon: Music, href: '#' },
      { key: 'stats', label: 'Stats Channels', icon: Activity, href: '#' },
      { key: 'embeds', label: 'Embed Builder', icon: Code2, href: '#' },
      { key: 'scheduled', label: 'Scheduled Messages', icon: CalendarClock, href: '#' },
      { key: 'tempvoice', label: 'Temp Voice', icon: Mic, href: '#' },
      { key: 'commands', label: 'Commands', icon: Terminal, href: '#' },
      { key: 'forum', label: 'Forum Management', icon: MessageSquare, href: '#' },
      { key: 'members', label: 'Members', icon: Users, href: '#' },
      { key: 'rss', label: 'RSS Feeds', icon: Rss, href: '#' },
      { key: 'streams', label: 'Stream Alerts', icon: Radio, href: '#' },
      { key: 'announcements', label: 'Announcements', icon: Megaphone, href: '#' },
    ],
  },
  {
    label: 'Extend',
    items: [
      { key: 'addons', label: 'Add-ons', icon: Puzzle, href: '#', badge: '7' },
      { key: 'tickets', label: 'Tickets', icon: Ticket, href: '#' },
      { key: 'applications', label: 'Applications', icon: ClipboardList, href: '#' },
      { key: 'monday', label: 'Monday.com', icon: SquareKanban, href: '#' },
      { key: 'trello', label: 'Trello', icon: Trello, href: '#' },
    ],
  },
];
