import Link from 'next/link';
import {
  Shield, Bot, TrendingUp, Music, Smile,
  Megaphone, ArrowRight, Check, ExternalLink,
  Star, Gift, Radio, Lightbulb, Calendar,
  BarChart2, Clock, Command, Zap, ChevronRight, Trophy, ThumbsUp, LineChart, Palette, Hash, UserPlus, MessageSquare, UserCheck,
  Mic, ShieldAlert, ShieldCheck, MessagesSquare, Flag, BarChart,
} from 'lucide-react';
import { LandingNav } from '@/components/LandingNav';

// ─── Shared constants ─────────────────────────────────────────────────────────

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';

const SITE = {
  name: 'Arken Bot',
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

// ─── Feature detail data ──────────────────────────────────────────────────────

const FEATURE_SECTIONS = [
  {
    id: 'moderation',
    icon: Shield,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    accentBorder: 'border-blue-500/40',
    title: 'Moderation',
    tagline: 'Keep your server safe with a full moderation toolkit.',
    description:
      'Ban, kick, mute, warn, and temp-ban members with full case tracking and audit logs. Every action is recorded with a case ID, reason, and moderator — all reviewable from the dashboard.',
    bullets: [
      'Ban, kick, timeout (mute), warn, and temp-ban commands',
      'Full case history with case IDs and moderator attribution',
      'Warning accumulation tracking per member',
      'Review and manage all cases from the web dashboard',
      'Audit log integration for server transparency',
      'Role-based permission controls for who can moderate',
      'Temp roles: assign a Discord role for a fixed duration, removed automatically on expiry',
      'Bulk case close: close all open cases for a user in a single action',
    ],
  },
  {
    id: 'automod',
    icon: Bot,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    accentBorder: 'border-red-500/40',
    title: 'Auto-Mod',
    tagline: 'Automated protection that works around the clock.',
    description:
      'Prevent spam, filter unwanted content, and stop raids before they happen — all without lifting a finger. Rules are configurable per-role and per-channel so legitimate users are never caught in the net.',
    bullets: [
      'Anti-spam: rate-limit messages and auto-delete excess',
      'Word and phrase filter with wildcard support',
      'Link filter with domain allowlist/blocklist',
      'Caps detection to suppress all-caps abuse',
      'Mention spam protection (mass ping prevention)',
      'Anti-raid mode: lock channels or kick new joins during an attack',
      'Per-role and per-channel rule exceptions',
    ],
  },
  {
    id: 'leveling',
    icon: TrendingUp,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    accentBorder: 'border-green-500/40',
    title: 'Leveling & XP',
    tagline: 'Reward active members and build a thriving community.',
    description:
      'Members earn XP for every message they send. As they level up they unlock special roles, and the public leaderboard encourages healthy competition. Every aspect is tunable — including XP multipliers, role stacking, decay for inactive users, and daily streak tracking.',
    bullets: [
      'XP earned automatically on every message with configurable rate',
      'Per-channel XP multipliers from the dashboard',
      'Rank cards showing level, XP, and leaderboard position with custom accent colours and backgrounds',
      'Public leaderboard page accessible without logging in',
      'Level roles: grant roles automatically at any level threshold',
      'Keep or remove previous level roles when a member ranks up',
      'Bulk role sync: apply correct roles to all existing members at once',
      'Rich embed level-up announcements with milestone images (levels 5, 10, 25, 50+)',
      'Daily message streaks tracked and displayed on profile',
      'XP decay: automatically reduce XP for members inactive beyond a threshold',
      'Configurable decay percentage and inactivity window per server',
      '/profile and /stats commands for detailed per-user breakdowns',
    ],
  },
  {
    id: 'customization',
    icon: Palette,
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    accentBorder: 'border-fuchsia-500/40',
    title: 'Customization',
    tagline: 'Make the bot feel native to your server and your profile.',
    description:
      'Set a custom nickname for the bot in your server so it matches your community branding. Members can also personalise their own rank card with a custom accent colour and background image — no staff action required.',
    bullets: [
      'Custom bot nickname per server — set from the dashboard Settings page',
      'Nickname applied instantly via the bot without a restart',
      '/rankcard color — set a custom hex accent colour on your rank card',
      '/rankcard background — set a custom background image URL',
      '/rankcard preview — preview your style before anyone else sees it',
      '/rankcard reset — revert to the default rank card style',
      'Rank card styles are per-user and carry across all servers',
    ],
  },
  {
    id: 'achievements',
    icon: Trophy,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    accentBorder: 'border-yellow-500/40',
    title: 'Achievements',
    tagline: 'Give members something to work toward beyond the leaderboard.',
    description:
      'Achievements are awarded automatically as members hit milestones — no commands needed from staff. Badges appear on the /profile card and encourage long-term engagement through streaks, activity, and level goals.',
    bullets: [
      'Automatically awarded when members hit qualifying milestones',
      'Level milestones: Rising Star (5), Veteran (25), Legend (100), and more',
      'Activity milestones: First Steps (1st message), Dedicated (1 000 messages)',
      'Streak milestones: Week Warrior (7 days), Month Legend (30), Century Streak (100)',
      'Badges displayed on the /profile command with emoji and name',
      'Achievement count shown on the /stats command',
      'No configuration required — works out of the box',
    ],
  },
  {
    id: 'reputation',
    icon: ThumbsUp,
    color: 'text-lime-400',
    bg: 'bg-lime-500/10',
    border: 'border-lime-500/20',
    accentBorder: 'border-lime-500/40',
    title: 'Reputation',
    tagline: 'Let the community recognise its most helpful members.',
    description:
      'Members can give each other reputation points to highlight helpfulness and positive contributions. A 24-hour cooldown per user keeps the system fair, and a server-wide leaderboard surfaces your most valued community members.',
    bullets: [
      '/rep give <user> — award a reputation point to any member',
      '/rep check <user> — view a member\'s total reputation',
      '/rep top — server-wide reputation leaderboard',
      '24-hour cooldown per giver enforced via Redis',
      'Reputation count displayed on /stats and /profile',
      'Completely free — no voting site integration required',
    ],
  },
  {
    id: 'analytics',
    icon: LineChart,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    accentBorder: 'border-indigo-500/40',
    title: 'Server Analytics',
    tagline: 'Understand how your server grows and stays active.',
    description:
      'Arken Bot tracks daily activity counters in the background and stores them in a 30-day rolling history. The dashboard renders interactive charts so you can spot trends, measure the impact of events, and catch activity drops early.',
    bullets: [
      'Daily message count tracked across the entire server',
      'Daily command usage tracking',
      'Member join and leave counters per day',
      '30-day rolling history stored in the database',
      'Interactive line and bar charts in the dashboard Analytics page',
      'Member growth chart (joins vs. leaves)',
      'Activity chart (messages + commands over time)',
      'No additional setup — tracking starts automatically',
    ],
  },
  {
    id: 'invite-tracker',
    icon: UserPlus,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    accentBorder: 'border-cyan-500/40',
    title: 'Invite Tracker',
    tagline: 'See exactly who is growing your community.',
    description:
      'Arken Bot tracks which invite link every new member used when they joined. A server-wide leaderboard ranks members by how many people they have brought in, encouraging healthy community growth.',
    bullets: [
      'Automatically detects which invite code a new member used',
      '/invites — check your own or another member\'s invite count',
      '/invitetop — server leaderboard of top inviters with medals',
      'Bonus invites: staff can manually adjust a member\'s invite count',
      'Enable or disable per-server from the Invite Tracker dashboard page',
      'No extra bot permissions required beyond Manage Guild',
    ],
  },
  {
    id: 'counting',
    icon: Hash,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    accentBorder: 'border-orange-500/40',
    title: 'Counting Game',
    tagline: 'A simple community game — count together without breaking the streak.',
    description:
      'Designate a channel and members take turns sending the next number in sequence. Break the streak with the wrong number and the count resets for everyone. Milestone reactions celebrate big numbers. Install via the Addon Manager.',
    bullets: [
      'Designate any text channel as the counting channel',
      'Bot reacts ✅ to correct counts and 🎉 every 100 numbers',
      'Wrong number resets the count back to 1',
      'Prevents the same user from counting twice in a row (configurable)',
      'Reset-on-fail can be toggled off for a more relaxed mode',
      'Best-count record tracked and visible in the dashboard',
      '/startcounting — posts a game announcement embed in the counting channel',
      'Installed as an addon — no impact on servers that don\'t use it',
    ],
  },
  {
    id: 'music',
    icon: Music,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    accentBorder: 'border-purple-500/40',
    title: 'Music',
    tagline: 'High-quality music directly in your voice channels.',
    description:
      'Play music from YouTube with slash commands. Manage a queue, control volume, loop tracks, and keep the party going — all through Discord without leaving the app.',
    bullets: [
      'YouTube audio playback via slash commands',
      'Queue management: add, skip, remove, and view tracks',
      'Volume control',
      'Loop modes: repeat one track or the entire queue',
      'Persistent queue state across sessions',
      'Playback controls from Discord commands',
    ],
  },
  {
    id: 'custom-commands',
    icon: Command,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    accentBorder: 'border-yellow-500/40',
    title: 'Custom Commands',
    tagline: 'Build commands that are unique to your server.',
    description:
      'Create your own commands with rich embed responses, custom logic, and role-based restrictions — no coding required. Build an unlimited number of commands entirely from the dashboard.',
    bullets: [
      'Create slash or prefix-style custom commands',
      'Rich embed responses with title, description, fields, and color',
      'Variable substitution: user mention, server name, member count, etc.',
      'Per-user cooldowns to prevent spam',
      'Role restrictions: limit commands to specific roles',
      'DM reply option: respond privately to the invoking user',
      'Command aliases for alternate trigger names',
      'Unlimited commands — no cap',
    ],
  },
  {
    id: 'auto-responses',
    icon: MessageSquare,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
    accentBorder: 'border-teal-500/40',
    title: 'Auto-Responses',
    tagline: 'Automatically reply to messages matching a regex pattern.',
    description:
      'Create rules that trigger an automatic reply whenever a message matches a pattern. Rules support regex with configurable flags, plain text or embed responses, optional message deletion, and role-based restrictions. Manage everything from the dashboard or via the /autoresponse command.',
    bullets: [
      'Regex pattern matching on every incoming message',
      'Configurable regex flags (case-insensitive by default)',
      'Plain text or rich embed response per rule',
      'Custom hex colour for embed responses',
      'Optionally delete the triggering message on match',
      'Enable or disable individual rules without deleting them',
      'Full rule list with per-rule use counters in the dashboard',
      'Redis-cached rule list for near-zero latency',
      'Manage rules via /autoresponse or the dashboard Commands page',
      'Unlimited rules per server',
    ],
  },
  {
    id: 'reaction-roles',
    icon: Smile,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    accentBorder: 'border-orange-500/40',
    title: 'Reaction Roles',
    tagline: 'Let members self-assign roles with a single click.',
    description:
      'Create role menus using button panels that members can interact with. Supports toggle, add-only, and remove-only modes. Panels reflect changes in Discord in real time when edited through the dashboard.',
    bullets: [
      'Button-based role panels (no emoji reactions required)',
      'Toggle mode: click to add, click again to remove',
      'Add-only mode: members can only gain the role',
      'Remove-only mode: members can only remove the role',
      'Multiple panels per server with different configurations',
      'Dashboard editor with real-time Discord preview updates',
    ],
  },
  {
    id: 'self-roles',
    icon: UserCheck,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    accentBorder: 'border-violet-500/40',
    title: 'Self-Assignable Roles',
    tagline: 'Members pick their own roles with a simple slash command.',
    description:
      'Admins define a list of self-assignable roles and give each a short name. Members can then run /selfassignrole or /selfremoverole at any time — no reaction panels needed. Autocomplete makes discovery effortless. Manage the list from the dashboard or with /selfrole.',
    bullets: [
      '/selfassignrole <name> — claim a role instantly',
      '/selfremoverole <name> — drop a role instantly',
      'Autocomplete shows only roles the member can add or remove',
      'Admins manage the list with /selfrole add / remove / list',
      'Full dashboard editor — add or remove entries without a command',
      'Bot role-hierarchy check prevents assigning unmanageable roles',
      'Redis-cached role list for near-zero latency',
      'Unlimited self-assignable roles per server',
    ],
  },
  {
    id: 'welcome',
    icon: Megaphone,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    accentBorder: 'border-pink-500/40',
    title: 'Welcome & Leave',
    tagline: 'Make a great first impression on every new member.',
    description:
      'Greet new members with a fully customizable embed message in any channel, and optionally send them a DM when they join. Get leave notifications with updated member counts so you always know your server\'s size.',
    bullets: [
      'Customizable welcome embed: title, description, color, image',
      'Variable substitution: username, mention, server name, member count',
      'Optional DM sent to new members on join',
      'Leave notification embeds in a separate channel',
      'Member counter updates on join and leave',
      'Enable or disable individually from the dashboard',
    ],
  },
  {
    id: 'giveaways',
    icon: Gift,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    accentBorder: 'border-emerald-500/40',
    title: 'Giveaways',
    tagline: 'Run fair, automated giveaways for your community.',
    description:
      'Start giveaways directly in Discord. When the timer ends, Arken Bot picks winners automatically and announces them in the channel. View all active and ended giveaways along with winner names in the dashboard.',
    bullets: [
      'Create giveaways with a slash command from Discord',
      'Configurable duration and number of winners',
      'Automatic winner selection when the timer ends',
      'Winner announcement posted in the giveaway channel',
      'Dashboard shows all active and past giveaways',
      'Winner names and entries visible in the portal',
    ],
  },
  {
    id: 'stream-alerts',
    icon: Radio,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    accentBorder: 'border-rose-500/40',
    title: 'Stream Alerts',
    tagline: 'Notify your community the moment anything goes live or gets posted.',
    description:
      'Monitor Twitch, Kick, X (Twitter), Reddit, and RSS/Podcast feeds and automatically post a notification embed in any Discord channel when there is new content. Keep your community engaged without manual announcements.',
    bullets: [
      'Twitch: alerts when a channel goes live',
      'Kick: alerts when a Kick.com channel goes live',
      'X (Twitter): alerts when a user posts a new tweet',
      'Reddit: alerts when a subreddit gets a new post',
      'RSS / Podcast: alerts when a feed publishes a new episode or post',
      'Configurable alert channel and custom message per alert',
      'Multiple alerts tracked simultaneously across platforms',
    ],
  },
  {
    id: 'starboard',
    icon: Star,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    accentBorder: 'border-amber-500/40',
    title: 'Starboard',
    tagline: 'Celebrate your server\'s best messages.',
    description:
      'When a message reaches a reaction threshold, it gets pinned to a dedicated starboard channel automatically. A great way to highlight funny, helpful, or memorable moments.',
    bullets: [
      'Configurable reaction emoji (default ⭐)',
      'Configurable reaction threshold to qualify for the board',
      'Toggle self-starring: allow or prevent authors from starring their own posts',
      'Dedicated starboard channel with embedded reposts',
      'Enable or disable via the dashboard',
    ],
  },
  {
    id: 'suggestions',
    icon: Lightbulb,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    accentBorder: 'border-violet-500/40',
    title: 'Suggestions',
    tagline: 'Give members a structured voice in your server.',
    description:
      'Members submit suggestions via a slash command. Staff can approve, deny, or mark them as implemented directly from the dashboard. Accepted and rejected suggestions are clearly communicated back to the community.',
    bullets: [
      'Members submit suggestions with a slash command',
      'Suggestions posted as embeds in a dedicated channel',
      'Staff can approve, deny, or mark as implemented',
      'Dashboard view of all pending and resolved suggestions',
      'Status updates posted back to the suggestion channel',
    ],
  },
  {
    id: 'birthdays',
    icon: Calendar,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    accentBorder: 'border-sky-500/40',
    title: 'Birthdays',
    tagline: 'Never miss a member\'s birthday again.',
    description:
      'Members register their birthday once. On the day, Arken Bot posts a birthday announcement in your chosen channel and optionally assigns a special birthday role for exactly 24 hours.',
    bullets: [
      'Members set their birthday with a slash command',
      'Automatic birthday announcement on the correct date',
      'Configurable announcement channel',
      'Optional birthday role assigned for 24 hours on the day',
      'Dashboard shows upcoming birthdays',
    ],
  },
  {
    id: 'stats-channels',
    icon: BarChart2,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    accentBorder: 'border-indigo-500/40',
    title: 'Stats Channels',
    tagline: 'Live server statistics displayed right in your channel list.',
    description:
      'Create voice channels whose names automatically update to reflect live server statistics. Members can see total member counts, boost tiers, and more at a glance without any commands.',
    bullets: [
      'Voice channels with auto-updating names',
      'Display total member count',
      'Display online member count',
      'Display server boost tier and count',
      'Configure multiple stat channels simultaneously',
      'Update interval managed by the dashboard',
    ],
  },
  {
    id: 'scheduled-messages',
    icon: Clock,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
    accentBorder: 'border-teal-500/40',
    title: 'Scheduled Messages',
    tagline: 'Automate recurring announcements and reminders.',
    description:
      'Schedule messages to be posted in any channel on any repeating interval. Ideal for weekly announcements, server rule reminders, event notifications, or any recurring content.',
    bullets: [
      'Schedule recurring messages to any channel',
      'Configurable repeat interval (hourly, daily, weekly, custom)',
      'Supports plain text or rich embed messages',
      'Multiple scheduled messages active simultaneously',
      'Manage and pause schedules from the dashboard',
    ],
  },
  {
    id: 'temp-voice',
    icon: Mic,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    accentBorder: 'border-sky-500/40',
    title: 'Temp Voice Channels',
    tagline: 'Members get their own voice channel on demand — no clutter.',
    description:
      'Configure one or more Join-to-Create trigger channels. When a member joins a trigger, the bot instantly creates a private voice channel for them and moves them in. When the last person leaves, the channel is deleted automatically.',
    bullets: [
      'Multiple trigger channels per server — configure as many as you need',
      'Each trigger can route created channels into a specific category',
      'Created channel is named after the member automatically',
      'Member gets owner permissions: rename, set user limit, manage permissions',
      'Everyone else can view and join the channel by default',
      'Empty channels are deleted the moment the last member leaves',
      'No orphaned channels — fully automatic lifecycle',
      'Manage all triggers from Dashboard → Temp Voice',
    ],
  },
  {
    id: 'anti-nuke',
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    accentBorder: 'border-red-500/40',
    title: 'Anti-Nuke',
    tagline: 'Stop server nukes before the damage is done.',
    description:
      'Anti-Nuke monitors for rapid destructive actions — mass channel deletions, mass role deletions, and mass bans — and automatically takes action against the offending user the moment thresholds are exceeded.',
    bullets: [
      'Detects mass channel deletions above a configurable threshold',
      'Detects mass role deletions above a configurable threshold',
      'Detects mass bans above a configurable threshold',
      'Response options: de-op (remove all roles), kick, or ban',
      'Configurable alert channel for nuke notifications',
      'All thresholds independently tunable from the dashboard',
      'Works in real time — no delay between detection and action',
      'De-op mode recommended to stop attacks without permanent bans',
    ],
  },
  {
    id: 'verification',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    accentBorder: 'border-emerald-500/40',
    title: 'Verification Gate',
    tagline: 'Filter bots and alts before they reach your community.',
    description:
      'New members receive a Pending Role on join and can only see a designated verify channel. Clicking the verify button gives them the Member Role and full server access. Simple, effective, and entirely automated.',
    bullets: [
      'New members assigned the Pending Role automatically on join',
      'Pending Role restricts access to all channels except the verify channel',
      'One-click verification button posted in your chosen channel',
      'Member Role assigned on verify, granting full access instantly',
      'Enable or disable with a single toggle from the dashboard',
      'Works with any role hierarchy — fully customizable roles and channel',
      'Compatible with Welcome Messages to greet members after they verify',
      'No commands required from staff — fully hands-off after setup',
    ],
  },
  {
    id: 'forum-management',
    icon: MessagesSquare,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    accentBorder: 'border-violet-500/40',
    title: 'Forum Management',
    tagline: 'Automate templates and tagging in Discord forum channels.',
    description:
      'Configure any number of forum channels to receive automatic template messages when a new thread is created, and automatically apply a tag to every post. Each channel is configured independently.',
    bullets: [
      'Auto-post a template message as the first reply in every new thread',
      'Automatically apply a forum tag to every new post',
      'Configure multiple forum channels independently',
      'Template messages support full Discord markdown',
      'Auto-tag uses a tag ID — right-click any tag in Discord to copy it',
      'Add or remove forum channels from management at any time',
      'Changes apply to new threads only — existing threads are unaffected',
      'Bot requires Send Messages and Manage Threads in each forum channel',
    ],
  },
  {
    id: 'polls',
    icon: BarChart,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    accentBorder: 'border-blue-500/40',
    title: 'Polls',
    tagline: 'Gather community feedback with button-based polls.',
    description:
      'Create polls directly in Discord using the /poll command. Members vote via interactive buttons and the dashboard gives staff a central place to view results, close voting, or delete polls.',
    bullets: [
      '/poll slash command — create a poll with 2–4 options',
      'Members vote via Discord buttons — one vote per member enforced',
      'Dashboard view of all active and closed polls in the server',
      'Close a poll to stop accepting new votes without deleting it',
      'Delete polls from the dashboard to remove vote data',
      'Each poll card shows total votes, option count, and creation date',
      'Open/Closed status visible at a glance',
    ],
  },
  {
    id: 'reports',
    icon: Flag,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    accentBorder: 'border-orange-500/40',
    title: 'Member Reports',
    tagline: 'A structured channel for members to flag rule-breakers.',
    description:
      'Members submit reports via /report without needing to DM a moderator. Staff review all pending reports in the dashboard, add internal notes, and mark them as reviewed or dismissed — keeping moderation organised and auditable.',
    bullets: [
      '/report slash command for members to flag any user',
      'Configurable report notification channel for staff alerts',
      'Dashboard shows all pending reports with reporter, target, and reason',
      'Staff can mark reports reviewed or dismiss them with a note',
      'Staff notes recorded internally and visible in the report history',
      'Separate tabs for pending and reviewed reports',
      'Pending reports auto-refresh every 30 seconds',
      'Pending count shown as a badge on the tab for quick visibility',
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Features — Arken Bot',
  description:
    'Explore every built-in feature Arken Bot offers: moderation, leveling, achievements, reputation, analytics, music, custom commands, reaction roles, stream alerts, giveaways, and more — all free, no paywalls.',
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-discord-darkest-bg text-gray-200 flex flex-col">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-discord-blurple/[0.06] rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-discord-blurple/15 border border-discord-blurple/25 text-discord-blurple text-xs font-medium mb-6">
            <Zap className="w-3 h-3" />
            Free forever · No paywalls · No premium tiers
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Every Feature,{' '}
            <span className="bg-gradient-to-r from-discord-blurple via-purple-400 to-blue-400 bg-clip-text text-transparent">
              Fully Documented
            </span>
          </h1>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed max-w-xl mx-auto">
            Arken Bot ships with 20 built-in feature modules and growing. Need more? The addon system adds tickets, server monitoring, code review, and more — all installable from the dashboard. Everything is free — no tiers, no paywalls.
          </p>

          {/* Quick jump links */}
          <div className="flex flex-wrap justify-center gap-2">
            {FEATURE_SECTIONS.map((f) => (
              <a
                key={f.id}
                href={`#${f.id}`}
                className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                {f.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature detail sections ── */}
      <div className="max-w-5xl mx-auto px-6 pb-24 space-y-6">
        {FEATURE_SECTIONS.map((f, idx) => {
          const Icon = f.icon;
          return (
            <section
              key={f.id}
              id={f.id}
              className={`rounded-2xl border border-white/[0.08] overflow-hidden scroll-mt-20 ${
                idx % 2 === 0 ? 'bg-discord-darker-bg' : 'bg-discord-darker-bg/60'
              }`}
            >
              {/* Header */}
              <div className={`flex items-start gap-4 p-6 border-b border-white/[0.06] ${f.bg}`}>
                <div className={`w-11 h-11 rounded-xl ${f.bg} border ${f.accentBorder} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <div>
                  <h2 className="text-white font-bold text-xl">{f.title}</h2>
                  <p className={`text-sm font-medium mt-0.5 ${f.color}`}>{f.tagline}</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6">
                <div>
                  <p className="text-gray-400 text-sm leading-relaxed mb-5">{f.description}</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-gray-300">
                        <span className={`w-4 h-4 rounded-full ${f.bg} border ${f.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Check className={`w-2.5 h-2.5 ${f.color}`} />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Addons callout ── */}
      <div className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[0.06] p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <div className="flex-1">
            <p className="text-xs font-semibold text-fuchsia-400 uppercase tracking-widest mb-2">Want even more?</p>
            <h3 className="text-white font-bold text-xl mb-2">Extend Arken with Addons</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              The addon system adds Tickets, Game Server Status, RSM Server Manager, and Code Review — all installable from the dashboard. Or build your own with the TypeScript SDK.
            </p>
          </div>
          <Link
            href="/addons"
            className="btn-secondary shrink-0 inline-flex items-center gap-2 px-6 py-2.5 text-sm whitespace-nowrap"
          >
            Browse Addons <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* ── CTA ── */}
      <section className="py-20 px-6 text-center border-t border-white/[0.04] bg-discord-darker-bg/30">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
            Ready to add Arken Bot to your server?
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            All features are available immediately after inviting — no configuration required to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={SITE.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-[15px] px-10 py-3 shadow-lg shadow-discord-blurple/20 inline-flex items-center gap-2 justify-center"
            >
              Add to Server — It&apos;s Free <ArrowRight className="w-4 h-4" />
            </a>
            <Link href="/auth" className="btn-secondary text-[15px] px-10 py-3 inline-flex items-center gap-2 justify-center">
              Open Dashboard <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-discord-blurple rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.030z" />
              </svg>
            </div>
            <span className="font-semibold text-white text-sm">Arken Bot</span>
            <span className="text-gray-700 text-xs ml-1">© {new Date().getFullYear()}</span>
          </div>

          <div className="flex items-center gap-5 text-xs text-gray-500">
            <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
            <Link href="/features" className="hover:text-gray-300 transition-colors text-gray-300">Features</Link>
            <Link href="/auth" className="hover:text-gray-300 transition-colors">Dashboard</Link>
            <a href={SITE.docsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors flex items-center gap-1">
              Docs <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Support</a>
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
