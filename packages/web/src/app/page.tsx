import Link from 'next/link';
import {
  Shield, Bot, TrendingUp, Music, Smile, Puzzle,
  Ticket, Megaphone, Zap, ArrowRight, Check, ExternalLink,
  ChevronRight, Star, Users, MessageSquare, Sparkles, LayoutDashboard,
  Gift, Radio, Lightbulb, Calendar,
  BarChart2, Clock, Settings, Command, Globe, X,
  Mic, ShieldAlert, ShieldCheck, MessagesSquare, Flag, BarChart,
  Trello } from 'lucide-react';
import { LandingNav } from '@/components/LandingNav';
import { Footer } from '@/components/Footer';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Arken Bot — Free Discord Bot with Web Dashboard',
  description:
    'Arken Bot is a completely free Discord bot with moderation, leveling, tickets, stream alerts, Trello & Monday.com integrations, temp voice, anti-nuke, and a real-time web dashboard. No paywalls, ever.',
  openGraph: {
    title: 'Arken Bot — Free Discord Bot with Web Dashboard',
    description:
      'Moderation, leveling, tickets, stream alerts, integrations, and a real-time dashboard. Completely free — no paywalls, no premium tiers.',
    url: 'https://arkenbot.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arken Bot — Free Discord Bot with Web Dashboard',
    description:
      'Moderation, leveling, tickets, stream alerts, integrations, and a real-time dashboard. Completely free — no paywalls, no premium tiers.',
  },
};

// ─── Easy-to-edit content ────────────────────────────────────────────────────

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';

const SITE = {
  name: 'Arken Bot',
  tagline: 'One Bot.\nEvery Feature.',
  description:
    'Moderation, leveling, tickets, custom commands, auto-responses, temp voice channels, anti-nuke, verification gate, forum management, polls, music, giveaways, stream alerts, and a real-time web dashboard — fully free, no paywalls.',
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

const FEATURES = [
  {
    icon: Shield,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Moderation',
    desc: 'Ban, kick, mute, warn, and temp-ban with full case tracking, audit logs, and warning history — all manageable from the dashboard.',
  },
  {
    icon: Bot,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    title: 'Auto-Mod',
    desc: 'Anti-spam, word filters, link filters, caps detection, mention protection, and anti-raid — all configurable per-role and per-channel.',
  },
  {
    icon: TrendingUp,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    title: 'Leveling & XP',
    desc: 'Keep members engaged with an XP system, rank cards, public leaderboards, role rewards at any level threshold, and configurable XP multipliers.',
  },
  {
    icon: Music,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    title: 'Music',
    desc: 'High-quality music from YouTube with queue management, volume control, loop modes, and persistent queue state.',
  },
  {
    icon: Ticket,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    title: 'Support Tickets',
    desc: 'Multi-panel ticket system with private channels or threads, form fields, SLA escalation, canned responses, transcripts, and ratings.',
  },
  {
    icon: Command,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    title: 'Custom Commands',
    desc: 'Build your own commands with aliases, embed responses, per-user cooldowns, role restrictions, DM replies, and variable substitution.',
  },
  {
    icon: Smile,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'Reaction Roles',
    desc: 'Let members self-assign roles. Supports toggle, add-only, and remove-only modes. Panels update in Discord in real time.',
  },
  {
    icon: Megaphone,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    title: 'Welcome & Leave',
    desc: 'Greet new members with fully customizable embed messages, DM on join, and leave notifications with member counters.',
  },
  {
    icon: Gift,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Giveaways',
    desc: 'Run giveaways from Discord with automatic winner selection. View all active and ended giveaways with winner names in the dashboard.',
  },
  {
    icon: Radio,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    title: 'Stream Alerts',
    desc: 'Get notified when Twitch, Kick, or YouTube channels go live, or when Twitter, Reddit, or RSS feeds update. Posts a notification embed automatically.',
  },
  {
    icon: Trello,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    title: 'monday.com & Trello Alerts',
    desc: 'Connect your project boards to Discord. Detailed embeds when cards and items are created, moved, renamed, commented on, and more.',
  },
  {
    icon: Star,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    title: 'Starboard',
    desc: 'Highlight the best messages in your server. Configurable reaction threshold, self-star toggle, and emoji selection.',
  },
  {
    icon: Lightbulb,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    title: 'Suggestions',
    desc: 'Member suggestion system with staff review. Approve, deny, or mark as implemented — all from the dashboard.',
  },
  {
    icon: Calendar,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    title: 'Birthdays',
    desc: 'Track member birthdays and automatically announce them in a channel. Optionally assign a birthday role for 24 hours.',
  },
  {
    icon: BarChart2,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    title: 'Stats Channels',
    desc: 'Live-updating voice channels that display server stats — total members, online count, boost tier, and more.',
  },
  {
    icon: Clock,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
    title: 'Scheduled Messages',
    desc: 'Schedule recurring announcements or reminders to post automatically in any channel on any interval.',
  },
  {
    icon: Mic,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    title: 'Temp Voice Channels',
    desc: 'Members join a trigger channel to instantly get their own private voice channel, which is deleted automatically when empty. Supports multiple triggers across different categories.',
  },
  {
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    title: 'Anti-Nuke',
    desc: 'Detect and respond to mass channel deletions, role deletions, and mass bans in real time. Automatically de-ops, kicks, or bans the offending user before the damage spreads.',
  },
  {
    icon: ShieldCheck,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Verification Gate',
    desc: 'Require new members to click a verify button before accessing the server. Assign a pending role on join and a member role after verification — keep bots and lurkers out.',
  },
  {
    icon: MessagesSquare,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    title: 'Forum Management',
    desc: 'Auto-post a template message in every new forum thread and automatically apply a tag on creation. Configure independently per forum channel from the dashboard.',
  },
  {
    icon: BarChart,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Polls',
    desc: 'Create multi-option polls with the /poll command. Members vote via buttons and staff can close or delete polls from the dashboard.',
  },
  {
    icon: Flag,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'Member Reports',
    desc: 'Members submit reports via /report. Staff review pending reports in the dashboard, add notes, and mark them reviewed or dismissed.',
  },
  {
    icon: Puzzle,
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    title: 'Addon System',
    desc: 'Extend the bot with community addons or build your own using the Arken Addon SDK. Install and configure from the dashboard.',
  },
];

const TICKET_HIGHLIGHTS = [
  'Private channel or thread per ticket',
  'Multi-button panels with category routing',
  'Custom form fields shown before ticket opens',
  'Staff claim, transfer, and priority system',
  'Per-user and per-button staff role overrides',
  'Multi-level SLA escalation with ping roles',
  'Auto-assign tickets in round-robin order',
  'Staff notification channel on new tickets',
  'Canned responses with Discord autocomplete',
  'Transcripts posted to a log channel on close',
  'User rating system (1–5 stars)',
  'Waiting status to pause SLA timers',
  'Webhook notifications for integrations',
  'Full portal: filters, notes, bulk close, stats',
];

const COMPARISON = [
  { feature: 'Moderation + Case History',     arken: true,  note: '' },
  { feature: 'Auto-Mod (spam, words, links)',  arken: true,  note: '' },
  { feature: 'XP Leveling + Leaderboards',    arken: true,  note: '' },
  { feature: 'Music Playback',                arken: true,  note: '' },
  { feature: 'Custom Commands',               arken: true,  note: '' },
  { feature: 'Auto-Responses (regex)',          arken: true,  note: '' },
  { feature: 'Temp Roles',                      arken: true,  note: '' },
  { feature: 'Reaction Roles',                arken: true,  note: '' },
  { feature: 'Support Ticket System',         arken: true,  note: '' },
  { feature: 'Ticket Form Fields',            arken: true,  note: 'Unique to Arken' },
  { feature: 'Multi-level SLA Escalation',    arken: true,  note: 'Unique to Arken' },
  { feature: 'Giveaways',                     arken: true,  note: '' },
  { feature: 'Twitch, Kick & Social Alerts',   arken: true,  note: '' },
  { feature: 'Starboard',                     arken: true,  note: '' },
  { feature: 'Scheduled Messages',            arken: true,  note: '' },
  { feature: 'Stats Channels',               arken: true,  note: '' },
  { feature: 'Temp Voice Channels',           arken: true,  note: '' },
  { feature: 'Anti-Nuke Protection',          arken: true,  note: '' },
  { feature: 'Verification Gate',             arken: true,  note: '' },
  { feature: 'Forum Management',             arken: true,  note: '' },
  { feature: 'Polls & Member Reports',        arken: true,  note: '' },
  { feature: 'Real-time Web Dashboard',       arken: true,  note: '' },
  { feature: 'Addon Marketplace',             arken: true,  note: 'Unique to Arken' },
  { feature: 'Price',                         arken: true,  note: 'Free, always' },
];

const ADDONS = [
  { name: 'Ticket System', version: '1.0.0', desc: 'Full support ticket workflow — panels, form fields, SLA escalation, transcripts, ratings, and more.', icon: '🎫', verified: true },
  { name: 'Code Review', version: '2.0.0', desc: 'Static analysis for JavaScript, TypeScript, Python, JSON, CSS, and HTML snippets, with optional Groq AI-powered review.', icon: '💻', verified: true },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Invite the Bot', desc: 'Add Arken Bot to your server with one click. No complex setup required.' },
  { step: '02', title: 'Configure Your Server', desc: 'Use the web dashboard to enable features, set channels, and configure permissions instantly.' },
  { step: '03', title: 'Sit Back & Enjoy', desc: 'Your server is protected, engaged, and running smoothly. Extend further with addons.' },
];

const HERO_COMMANDS = [
  {
    cmd: '/ban @SpamUser 7d Advertising',
    icon: Shield,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    response: '🔨 Banned SpamUser · Case #47 created',
    responseColor: 'text-red-300',
  },
  {
    cmd: '!hello',
    icon: Command,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    response: '👋 Hey @Alex! Welcome to the server.',
    responseColor: 'text-yellow-300',
  },
  {
    cmd: '/rank @Alex',
    icon: TrendingUp,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    response: '⭐ Level 14 · 3,280 / 4,000 XP · Rank #3',
    responseColor: 'text-green-300',
  },
  {
    cmd: '/play Never Gonna Give You Up',
    icon: Music,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    response: '🎵 Added to queue · Position #1',
    responseColor: 'text-purple-300',
  },
];

const DISCORD_ICON = (
  <svg fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.030z" />
  </svg>
);

// ─── Server-side stats fetch ──────────────────────────────────────────────────

async function getStats(): Promise<{ servers: number; users: number } | null> {
  try {
    const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const res = await fetch(`${apiUrl}/public/stats`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const stats = await getStats();
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k+` : `${n}+`;

  return (
    <div className="min-h-screen bg-[var(--bg-surface)] text-[var(--text-primary)] flex flex-col">

      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-6 pt-24 pb-20">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[650px] bg-discord-blurple/[0.08] rounded-full blur-3xl" />
          <div className="absolute top-32 left-1/4 w-[400px] h-[300px] bg-purple-500/[0.04] rounded-full blur-3xl" />
          <div className="absolute top-32 right-1/4 w-[400px] h-[300px] bg-blue-500/[0.04] rounded-full blur-3xl" />
          {/* Subtle CSS grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-discord-blurple/15 border border-discord-blurple/25 text-discord-blurple text-[13px] font-semibold mb-9">
            <Sparkles className="w-3.5 h-3.5" />
            Free forever — no paywalls, no premium tiers
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-bold leading-[1.12] tracking-tight mb-6 text-white">
            The Discord bot that
            <br />
            does <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">everything</span>, elegantly.
          </h1>

          <p className="text-lg text-[var(--text-secondary)] mb-9 max-w-xl mx-auto leading-relaxed">
            Moderation, leveling, tickets, stream alerts, Trello &amp; Monday.com boards,
            and a real-time dashboard — all free, all in one bot.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <a
              href={SITE.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-[15px] px-8 py-3 shadow-lg shadow-discord-blurple/20"
            >
              Add to Discord <ArrowRight className="w-4 h-4" />
            </a>
            <Link href="/auth" className="btn-secondary text-[15px] px-8 py-3">
              Explore the dashboard
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-x-12 gap-y-4 justify-center mb-16">
            {[
              { value: stats ? fmt(stats.servers) : '30+', label: 'servers' },
              { value: stats ? fmt(stats.users) : '18k+', label: 'members served' },
              { value: '50+', label: 'features' },
              { value: '$0', label: 'forever' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-[22px] font-bold text-white leading-tight tabular">{s.value}</span>
                <span className="text-[12px] text-[var(--text-muted)] mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Mini feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {[
              { icon: Shield, title: 'Moderation that scales', desc: 'Cases, escalation, anti-nuke, and a full audit trail.' },
              { icon: Zap, title: 'Alerts for everything', desc: 'Twitch, Kick, YouTube, X, Reddit, RSS — plus Trello and Monday.com boards.' },
              { icon: TrendingUp, title: 'Leveling & engagement', desc: 'XP, role rewards, starboard, birthdays, giveaways.' },
              { icon: LayoutDashboard, title: "A dashboard you'll enjoy", desc: 'Everything configurable in the browser, changes live instantly.' },
            ].map((f) => (
              <div key={f.title} className="flex gap-3.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5">
                <span className="w-9 h-9 rounded-[10px] bg-[var(--accent-glow)] grid place-items-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-[var(--accent)]" />
                </span>
                <div>
                  <h3 className="text-white font-bold text-[14.5px] tracking-tight">{f.title}</h3>
                  <p className="text-[var(--text-secondary)] text-[13px] leading-relaxed mt-1">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust bar ── */}
      <div className="border-y border-[var(--border-subtle)] bg-[var(--bg-card)]/30 py-4 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {[
            { icon: Check, text: 'No premium tier — everything is free' },
            { icon: Zap, text: 'Settings apply instantly — no bot restart' },
            { icon: Shield, text: 'Full moderation suite included' },
            { icon: Globe, text: 'Real-time web dashboard' },
          ].map(({ icon: Icon, text }, i) => (
            <div key={text} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              {i > 0 && <span className="hidden sm:block w-1 h-1 rounded-full bg-[var(--text-muted)] mr-6" />}
              <Icon className="w-3.5 h-3.5 text-discord-blurple flex-shrink-0" />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6 bg-[var(--bg-surface)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-discord-blurple/10 border border-discord-blurple/20 text-discord-blurple text-xs font-semibold uppercase tracking-widest mb-4">
              Features
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              Replace 5 bots with one
            </h2>
            <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
              Moderation, leveling, music, tickets, custom commands, stream alerts, giveaways — and more. All in a single bot, all free.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
                >
                  <div className={`w-10 h-10 rounded-xl ${f.bg} border ${f.border} flex items-center justify-center mb-4`}>
                    <Icon className={`w-4.5 h-4.5 ${f.color}`} />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1.5 tracking-tight">{f.title}</h3>
                  <p className="text-[var(--text-muted)] text-xs leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Ticket System spotlight ── */}
      <section className="py-24 px-6 border-y border-[var(--border-subtle)] bg-[var(--bg-card)]/20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-4">
              Ticket System
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 tracking-tight">
              Professional support tickets, built in
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed text-sm">
              Most bots charge for a decent ticket system. Arken&apos;s is fully featured out of the box — from multi-button panels and custom intake forms, to SLA escalation and a full portal for your staff team.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-8">
              {TICKET_HIGHLIGHTS.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                  <span className="w-4 h-4 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-cyan-400" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
            <a href={SITE.inviteUrl} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex">
              Add to Server <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          {/* Ticket mock UI */}
          <div className="space-y-3">
            {/* Panel embed mock */}
            <div className="bg-[#1e1f22] rounded-xl border border-white/[0.06] overflow-hidden shadow-xl shadow-black/30 p-4">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-3 font-semibold">Panel embed preview</p>
              <div className="bg-[#2b2d31] rounded-lg overflow-hidden" style={{ borderLeft: '4px solid #00b0f4' }}>
                <div className="p-3">
                  <p className="text-white text-sm font-semibold mb-1">🎫 Support Center</p>
                  <p className="text-[var(--text-secondary)] text-xs leading-relaxed">Need help? Click a button below to open a ticket. Our team will be with you shortly.</p>
                  <div className="flex gap-2 mt-3">
                    <span className="bg-[#5865f2] text-white text-[11px] font-medium px-3 py-1.5 rounded">🛠️ Technical</span>
                    <span className="bg-[#3ecf8e] text-[#111] text-[11px] font-medium px-3 py-1.5 rounded">💳 Billing</span>
                    <span className="bg-[#4f545c] text-white text-[11px] font-medium px-3 py-1.5 rounded">📋 Report</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SLA levels mock */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 shadow-lg shadow-black/20">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-3 font-semibold">SLA escalation levels</p>
              <div className="space-y-2">
                {[
                  { hours: '2h', role: '@Support', msg: 'Ticket needs attention', color: 'text-yellow-400 bg-yellow-500/10' },
                  { hours: '8h', role: '@Lead', msg: 'No response — escalating', color: 'text-orange-400 bg-orange-500/10' },
                  { hours: '24h', role: '@Manager', msg: 'URGENT: 24h without reply', color: 'text-red-400 bg-red-500/10' },
                ].map((l) => (
                  <div key={l.hours} className="flex items-center gap-3 text-xs">
                    <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${l.color}`}>{l.hours}</span>
                    <span className="text-discord-blurple">{l.role}</span>
                    <span className="text-[var(--text-muted)] truncate">{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket stats mock */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Open', value: '8', color: 'text-discord-green' },
                { label: 'Avg Reply', value: '14m', color: 'text-blue-400' },
                { label: 'Rating', value: '4.8★', color: 'text-yellow-400' },
              ].map((s) => (
                <div key={s.label} className="bg-[var(--bg-card)] rounded-lg p-3 border border-[var(--border)] text-center">
                  <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature comparison ── */}
      <section id="compare" className="py-24 px-6 bg-[var(--bg-surface)]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-discord-blurple/10 border border-discord-blurple/20 text-discord-blurple text-xs font-semibold uppercase tracking-widest mb-4">
              Why Arken
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              Everything. Free. In one bot.
            </h2>
            <p className="text-[var(--text-secondary)] max-w-md mx-auto">
              Stop paying per-server subscriptions or running five different bots. Arken has it all — no tiers, no limits.
            </p>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-xl shadow-black/20">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto] px-5 py-3 border-b border-[var(--border-subtle)] bg-black/10">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Feature</span>
              <span className="text-xs font-semibold text-discord-blurple uppercase tracking-wider text-center w-28">Arken Bot</span>
            </div>
            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-[1fr_auto] items-center px-5 py-3 ${i % 2 === 0 ? 'bg-white/[0.01]' : ''} border-b border-[var(--border-subtle)] last:border-0`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)]">{row.feature}</span>
                  {row.note && (
                    <span className="text-[10px] text-discord-blurple bg-discord-blurple/10 border border-discord-blurple/20 px-1.5 py-0.5 rounded-full">
                      {row.note}
                    </span>
                  )}
                </div>
                <div className="w-28 flex justify-center">
                  {row.arken ? (
                    <span className="w-5 h-5 rounded-full bg-discord-green/15 border border-discord-green/30 flex items-center justify-center">
                      <Check className="w-3 h-3 text-discord-green" />
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-discord-red/10 border border-discord-red/20 flex items-center justify-center">
                      <X className="w-3 h-3 text-discord-red" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard spotlight ── */}
      <section className="py-24 px-6 border-y border-[var(--border-subtle)] bg-[var(--bg-card)]/20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-discord-blurple/10 border border-discord-blurple/20 text-discord-blurple text-xs font-semibold uppercase tracking-widest mb-4">
              Web Dashboard
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 tracking-tight">
              Manage everything from your browser
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed text-sm">
              No more typing commands to configure your bot. Every setting is in the dashboard — changes apply to the bot the moment you hit Save, with no restart required.
            </p>
            <ul className="space-y-2.5 mb-8">
              {[
                'Real-time settings via WebSocket — zero bot restarts',
                'Moderation case history and warning management',
                'Full ticket portal with filters, notes, and bulk actions',
                'XP leaderboards, level role management, and analytics',
                'Custom command builder with embed previews',
                'Addon marketplace — install, configure, and manage plugins',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <span className="w-4 h-4 rounded-full bg-discord-green/15 border border-discord-green/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-discord-green" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/auth" className="btn-primary inline-flex">
              Open Dashboard <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Mock dashboard preview */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden shadow-2xl shadow-black/40">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[var(--border-subtle)] bg-black/20">
              <div className="w-2.5 h-2.5 rounded-full bg-discord-red/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-discord-yellow/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-discord-green/60" />
              <span className="ml-2 text-[11px] text-[var(--text-muted)]">arkenbot.app/dashboard</span>
            </div>
            <div className="flex">
              {/* Mini sidebar */}
              <div className="w-36 border-r border-[var(--border-subtle)] p-2 space-y-0.5 bg-[var(--bg-elevated)]">
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <div className="w-5 h-5 rounded-lg bg-discord-blurple/80" />
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 bg-[var(--bg-hover)] rounded w-3/4" />
                    <div className="h-1 bg-[var(--bg-hover)] rounded w-1/2" />
                  </div>
                </div>
                {[
                  { label: 'Overview', active: true },
                  { label: 'Moderation', section: 'MODERATION' },
                  { label: 'Auto-Mod' },
                  { label: 'Leveling', section: 'COMMUNITY' },
                  { label: 'Welcome' },
                  { label: 'Commands' },
                  { label: 'Tickets', section: 'TOOLS' },
                  { label: 'Music' },
                  { label: 'Addons', section: 'ADDONS' },
                ].map((item, idx) => (
                  <div key={idx}>
                    {item.section && <p className="px-2 text-[8px] text-[var(--text-muted)] font-semibold uppercase tracking-widest mt-2 mb-0.5">{item.section}</p>}
                    <div className={`px-2 py-1 rounded text-[10px] ${item.active ? 'bg-discord-blurple/15 text-discord-blurple border-l-2 border-discord-blurple' : 'text-[var(--text-muted)]'}`}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
              {/* Content */}
              <div className="flex-1 p-3 space-y-2 bg-[var(--bg-surface)]">
                <div className="grid grid-cols-2 gap-1.5">
                  {['Mod Actions', 'New Members', 'Open Tickets', 'Log Events'].map((label) => (
                    <div key={label} className="bg-[var(--bg-card)] rounded-lg px-2.5 py-2 border border-[var(--border-subtle)]">
                      <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
                      <p className="text-base font-bold text-white">—</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[var(--bg-card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                  <p className="text-[9px] text-[var(--text-muted)] mb-2">Message Activity (7d)</p>
                  <div className="flex items-end gap-0.5 h-10">
                    {[3, 6, 4, 8, 5, 9, 7, 12, 6, 10, 8, 11, 9, 14].map((h, i) => (
                      <div key={i} className="flex-1 bg-discord-blurple/40 rounded-sm" style={{ height: `${h * 6}%` }} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[10px] text-[var(--text-muted)]">Settings update instantly · no restart required</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Addons ── */}
      <section id="addons" className="py-24 px-6 bg-[var(--bg-surface)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs font-semibold uppercase tracking-widest mb-4">
              Addon System
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              Extend with addons
            </h2>
            <p className="text-[var(--text-secondary)] max-w-md mx-auto">
              Install community addons directly from the dashboard, or build your own with the Arken Addon SDK.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {ADDONS.map((addon) => (
              <div key={addon.name} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex items-start justify-between mb-4">
                  <span className="text-3xl">{addon.icon}</span>
                  {addon.verified && (
                    <div className="flex items-center gap-1 text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                      <Star className="w-2.5 h-2.5" /> Verified
                    </div>
                  )}
                </div>
                <h3 className="text-white font-semibold mb-1 tracking-tight">{addon.name}</h3>
                <p className="text-[var(--text-muted)] text-xs mb-3 font-mono">v{addon.version}</p>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{addon.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <a href={SITE.docsUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">
              Build your own addon <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-6 border-y border-[var(--border-subtle)] bg-[var(--bg-card)]/20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">Get started in minutes</h2>
            <p className="text-[var(--text-secondary)]">No technical knowledge required.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative flex flex-col items-center text-center">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-[calc(50%+2.5rem)] w-[calc(100%-5rem)] h-px bg-gradient-to-r from-[var(--text-muted)] to-transparent" />
                )}
                <div className="w-10 h-10 rounded-xl bg-discord-blurple/15 border border-discord-blurple/30 flex items-center justify-center text-discord-blurple font-bold text-xs mb-4">
                  {step.step}
                </div>
                <h3 className="text-white font-semibold text-sm mb-2 tracking-tight">{step.title}</h3>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 0%, var(--accent-glow) 50%, transparent 100%)' }} />
        </div>
        <div className="max-w-2xl mx-auto relative z-10">
          <div className="w-14 h-14 bg-discord-blurple rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-discord-blurple/25">
            <span className="w-8 h-8 text-white">{DISCORD_ICON}</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Ready to upgrade your server?
          </h2>
          <p className="text-[var(--text-secondary)] mb-3 text-sm max-w-lg mx-auto">
            Join the servers already running on Arken Bot. Free forever — no subscriptions, no per-server fees, no feature gates.
          </p>
          <p className="text-[var(--text-muted)] text-xs mb-10">Works alongside your existing bots, or replace them entirely.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={SITE.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-[15px] px-10 py-3.5 shadow-lg shadow-discord-blurple/25"
            >
              Add Arken Bot — Free <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={SITE.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-[15px] px-10 py-3.5"
            >
              Join Support Server
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <Footer variant="full" docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />
    </div>
  );
}
