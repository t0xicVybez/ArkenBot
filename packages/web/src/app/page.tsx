import Link from 'next/link';
import {
  Shield, Bot, TrendingUp, Music, Smile, Puzzle,
  Ticket, Megaphone, Zap, ArrowRight, Check, ExternalLink,
  ChevronRight, Star, Users, MessageSquare, Sparkles, LayoutDashboard,
  Gift, Radio, Lightbulb, Calendar,
  BarChart2, Clock, Settings, Command, Globe, X,
  Mic, ShieldAlert, ShieldCheck, MessagesSquare, Flag, BarChart,
  Trello, Code2, Server } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
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

// Visual config only — title/desc text comes from the `landing.features.items`
// message array, zipped by index.
const FEATURES = [
  { icon: Shield,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  { icon: Bot,            color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  { icon: TrendingUp,     color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  { icon: Music,          color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  { icon: Ticket,         color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  { icon: Command,        color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  { icon: Smile,          color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  { icon: Megaphone,      color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20' },
  { icon: Gift,           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Radio,          color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  { icon: Trello,         color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Star,           color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  { icon: Lightbulb,      color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: Calendar,       color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: BarChart2,      color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: Clock,          color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20' },
  { icon: Mic,            color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: ShieldAlert,    color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  { icon: ShieldCheck,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: MessagesSquare, color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: BarChart,       color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  { icon: Flag,           color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  { icon: Puzzle,         color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
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
  const t = await getTranslations('landing');
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k+` : `${n}+`;

  const featureItems = t.raw('features.items') as Array<{ title: string; desc: string }>;
  const heroCards = t.raw('heroCards') as Array<{ title: string; desc: string }>;
  const trustBar = t.raw('trustBar') as string[];
  const ticketHighlights = t.raw('ticketHighlights') as string[];
  const comparison = t.raw('comparison.items') as Array<{ feature: string; note: string }>;
  const dashBullets = t.raw('dashBullets') as string[];

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
            {t('heroBadge')}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-bold leading-[1.12] tracking-tight mb-6 text-white">
            {t.rich('heroTitle', {
              br: () => <br />,
              hl: (c) => <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">{c}</span>,
            })}
          </h1>

          <p className="text-lg text-[var(--text-secondary)] mb-9 max-w-xl mx-auto leading-relaxed">
            {t('heroSubtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <a
              href={SITE.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-[15px] px-8 py-3 shadow-lg shadow-discord-blurple/20"
            >
              {t('heroAddButton')} <ArrowRight className="w-4 h-4" />
            </a>
            <Link href="/auth" className="btn-secondary text-[15px] px-8 py-3">
              {t('heroExplore')}
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-x-12 gap-y-4 justify-center mb-16">
            {[
              { value: stats ? fmt(stats.servers) : '30+', label: t('statServers') },
              { value: stats ? fmt(stats.users) : '18k+', label: t('statMembers') },
              { value: '50+', label: t('statFeatures') },
              { value: '$0', label: t('statForever') },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-[22px] font-bold text-white leading-tight tabular">{s.value}</span>
                <span className="text-[12px] text-[var(--text-muted)] mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Mini feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {[Shield, Zap, TrendingUp, LayoutDashboard].map((Icon, i) => ({ icon: Icon, title: heroCards[i].title, desc: heroCards[i].desc })).map((f) => (
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
          {[Check, Zap, Shield, Globe].map((Icon, i) => ({ icon: Icon, text: trustBar[i] })).map(({ icon: Icon, text }, i) => (
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
              {t('featuresBadge')}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              {t('featuresHeading')}
            </h2>
            <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
              {t('featuresSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const txt = featureItems[i];
              return (
                <div
                  key={i}
                  className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
                >
                  <div className={`w-10 h-10 rounded-xl ${f.bg} border ${f.border} flex items-center justify-center mb-4`}>
                    <Icon className={`w-4.5 h-4.5 ${f.color}`} />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1.5 tracking-tight">{txt.title}</h3>
                  <p className="text-[var(--text-muted)] text-xs leading-relaxed">{txt.desc}</p>
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
              {t('ticketBadge')}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 tracking-tight">
              {t('ticketHeading')}
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed text-sm">
              {t('ticketSubtitle')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-8">
              {ticketHighlights.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                  <span className="w-4 h-4 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-cyan-400" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
            <a href={SITE.inviteUrl} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex">
              {t('addToServer')} <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          {/* Ticket mock UI */}
          <div className="space-y-3">
            {/* Panel embed mock */}
            <div className="bg-[#1e1f22] rounded-xl border border-white/[0.06] overflow-hidden shadow-xl shadow-black/30 p-4">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-3 font-semibold">{t('mockPanelPreview')}</p>
              <div className="bg-[#2b2d31] rounded-lg overflow-hidden" style={{ borderLeft: '4px solid #00b0f4' }}>
                <div className="p-3">
                  <p className="text-white text-sm font-semibold mb-1">🎫 {t('mockSupportCenter')}</p>
                  <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{t('mockSupportDesc')}</p>
                  <div className="flex gap-2 mt-3">
                    <span className="bg-[#5865f2] text-white text-[11px] font-medium px-3 py-1.5 rounded">🛠️ {t('mockTechnical')}</span>
                    <span className="bg-[#3ecf8e] text-[#111] text-[11px] font-medium px-3 py-1.5 rounded">💳 {t('mockBilling')}</span>
                    <span className="bg-[#4f545c] text-white text-[11px] font-medium px-3 py-1.5 rounded">📋 {t('mockReport')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SLA levels mock */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 shadow-lg shadow-black/20">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-3 font-semibold">{t('mockSlaTitle')}</p>
              <div className="space-y-2">
                {[
                  { hours: '2h', role: '@Support', msg: t('mockSla1'), color: 'text-yellow-400 bg-yellow-500/10' },
                  { hours: '8h', role: '@Lead', msg: t('mockSla2'), color: 'text-orange-400 bg-orange-500/10' },
                  { hours: '24h', role: '@Manager', msg: t('mockSla3'), color: 'text-red-400 bg-red-500/10' },
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
                { label: t('mockStatOpen'), value: '8', color: 'text-discord-green' },
                { label: t('mockStatReply'), value: '14m', color: 'text-blue-400' },
                { label: t('mockStatRating'), value: '4.8★', color: 'text-yellow-400' },
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
              {t('compareBadge')}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              {t('compareHeading')}
            </h2>
            <p className="text-[var(--text-secondary)] max-w-md mx-auto">
              {t('compareSubtitle')}
            </p>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-xl shadow-black/20">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto] px-5 py-3 border-b border-[var(--border-subtle)] bg-black/10">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('compareColFeature')}</span>
              <span className="text-xs font-semibold text-discord-blurple uppercase tracking-wider text-center w-28">{t('compareColArken')}</span>
            </div>
            {/* Rows */}
            {comparison.map((row, i) => (
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
                  <span className="w-5 h-5 rounded-full bg-discord-green/15 border border-discord-green/30 flex items-center justify-center">
                    <Check className="w-3 h-3 text-discord-green" />
                  </span>
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
              {t('dashHeading')}
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed text-sm">
              {t('dashSubtitle')}
            </p>
            <ul className="space-y-2.5 mb-8">
              {dashBullets.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <span className="w-4 h-4 rounded-full bg-discord-green/15 border border-discord-green/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-discord-green" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/auth" className="btn-primary inline-flex">
              {t('dashOpenButton')} <ChevronRight className="w-4 h-4" />
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
                  { label: t('dashMockOverview'), active: true },
                  { label: t('dashMockModeration'), section: t('dashSecModeration') },
                  { label: t('dashMockAutomod') },
                  { label: t('dashMockLeveling'), section: t('dashSecCommunity') },
                  { label: t('dashMockWelcome') },
                  { label: t('dashMockCommands') },
                  { label: t('dashMockTickets'), section: t('dashSecTools') },
                  { label: t('dashMockMusic') },
                  { label: t('dashMockAddons'), section: t('dashSecAddons') },
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
                  {[t('dashStatMod'), t('dashStatMembers'), t('dashStatTickets'), t('dashStatEvents')].map((label) => (
                    <div key={label} className="bg-[var(--bg-card)] rounded-lg px-2.5 py-2 border border-[var(--border-subtle)]">
                      <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
                      <p className="text-base font-bold text-white">—</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[var(--bg-card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                  <p className="text-[9px] text-[var(--text-muted)] mb-2">{t('dashActivity')}</p>
                  <div className="flex items-end gap-0.5 h-10">
                    {[3, 6, 4, 8, 5, 9, 7, 12, 6, 10, 8, 11, 9, 14].map((h, i) => (
                      <div key={i} className="flex-1 bg-discord-blurple/40 rounded-sm" style={{ height: `${h * 6}%` }} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[10px] text-[var(--text-muted)]">{t('dashInstant')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Open source / GameQuery ── */}
      <section className="py-24 px-6 bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-4">
              <Code2 className="w-3.5 h-3.5" />
              {t('osBadge')}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              {t('osHeading')}
            </h2>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto">
              {t('osSubtitle')}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-start gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Server className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl tracking-tight">GameQuery</h3>
                    <p className="text-[var(--text-secondary)] text-xs">
                      {t('osTagline')}
                    </p>
                  </div>
                </div>

                <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-5">
                  {t.rich('osDesc', {
                    code: (c) => <code className="text-emerald-400">{c}</code>,
                  })}
                </p>

                <div className="grid grid-cols-3 gap-3 mb-6 max-w-sm">
                  {[
                    { n: '53', l: t('osStatGames') },
                    { n: '23', l: t('osStatProtocols') },
                    { n: '0', l: t('osStatDeps') },
                  ].map((s) => (
                    <div
                      key={s.l}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-3 py-2.5 text-center"
                    >
                      <div className="text-white font-bold text-lg leading-none">{s.n}</div>
                      <div className="text-[var(--text-secondary)] text-[11px] mt-1">{s.l}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://query.arkenbot.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05231a] font-semibold text-sm transition-colors"
                  >
                    {t('osTryLive')}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <a
                    href="https://github.com/t0xicVybez/GameQuery"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--border-subtle)] hover:border-emerald-500/40 text-white font-semibold text-sm transition-colors"
                  >
                    {t('osViewSource')}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="md:w-72 shrink-0">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[#0e1320] p-4 font-mono text-[12px] leading-relaxed overflow-x-auto">
                  <div className="text-[#5c6b8a] mb-1"># install it yourself</div>
                  <div className="text-[#c3e88d] mb-3">npm i @t0xicvybez/gamequery</div>
                  <div className="text-[#5c6b8a] mb-1"># or for PHP</div>
                  <div className="text-[#c3e88d]">composer require t0xicvybez/gamequery</div>
                </div>
                <p className="text-[var(--text-secondary)] text-[11px] mt-3 text-center">
                  {t('osLicense')}
                </p>
              </div>
            </div>
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
            {t('ctaHeading')}
          </h2>
          <p className="text-[var(--text-secondary)] mb-3 text-sm max-w-lg mx-auto">
            {t('ctaSubtitle')}
          </p>
          <p className="text-[var(--text-muted)] text-xs mb-10">{t('ctaNote')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={SITE.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-[15px] px-10 py-3.5 shadow-lg shadow-discord-blurple/25"
            >
              {t('ctaAddButton')} <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={SITE.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-[15px] px-10 py-3.5"
            >
              {t('ctaSupport')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <Footer variant="full" docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />
    </div>
  );
}
