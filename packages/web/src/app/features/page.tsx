import Link from 'next/link';
import {
  Shield, Bot, TrendingUp, Music, Smile,
  Megaphone, ArrowRight, Check, ExternalLink,
  Star, Gift, Radio, Lightbulb, Calendar,
  BarChart2, Clock, Command, Zap, ChevronRight, Trophy, ThumbsUp, LineChart, Palette, Hash, UserPlus, MessageSquare, UserCheck,
  Mic, ShieldAlert, ShieldCheck, MessagesSquare, Flag, BarChart, Trello,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
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

// Visual config only — title/tagline/description/bullets come from the
// `featuresPage.sections.<id>` message objects.
const FEATURE_SECTIONS = [
  { id: 'moderation', icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', accentBorder: 'border-blue-500/40' },
  { id: 'automod', icon: Bot, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', accentBorder: 'border-red-500/40' },
  { id: 'leveling', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', accentBorder: 'border-green-500/40' },
  { id: 'customization', icon: Palette, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', accentBorder: 'border-fuchsia-500/40' },
  { id: 'achievements', icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', accentBorder: 'border-yellow-500/40' },
  { id: 'reputation', icon: ThumbsUp, color: 'text-lime-400', bg: 'bg-lime-500/10', border: 'border-lime-500/20', accentBorder: 'border-lime-500/40' },
  { id: 'analytics', icon: LineChart, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', accentBorder: 'border-indigo-500/40' },
  { id: 'invite-tracker', icon: UserPlus, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', accentBorder: 'border-cyan-500/40' },
  { id: 'counting', icon: Hash, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', accentBorder: 'border-orange-500/40' },
  { id: 'music', icon: Music, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', accentBorder: 'border-purple-500/40' },
  { id: 'custom-commands', icon: Command, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', accentBorder: 'border-yellow-500/40' },
  { id: 'auto-responses', icon: MessageSquare, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', accentBorder: 'border-teal-500/40' },
  { id: 'reaction-roles', icon: Smile, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', accentBorder: 'border-orange-500/40' },
  { id: 'self-roles', icon: UserCheck, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', accentBorder: 'border-violet-500/40' },
  { id: 'welcome', icon: Megaphone, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20', accentBorder: 'border-pink-500/40' },
  { id: 'giveaways', icon: Gift, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', accentBorder: 'border-emerald-500/40' },
  { id: 'stream-alerts', icon: Radio, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', accentBorder: 'border-rose-500/40' },
  { id: 'board-alerts', icon: Trello, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', accentBorder: 'border-sky-500/40' },
  { id: 'starboard', icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', accentBorder: 'border-amber-500/40' },
  { id: 'suggestions', icon: Lightbulb, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', accentBorder: 'border-violet-500/40' },
  { id: 'birthdays', icon: Calendar, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', accentBorder: 'border-sky-500/40' },
  { id: 'stats-channels', icon: BarChart2, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', accentBorder: 'border-indigo-500/40' },
  { id: 'scheduled-messages', icon: Clock, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', accentBorder: 'border-teal-500/40' },
  { id: 'temp-voice', icon: Mic, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', accentBorder: 'border-sky-500/40' },
  { id: 'anti-nuke', icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', accentBorder: 'border-red-500/40' },
  { id: 'verification', icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', accentBorder: 'border-emerald-500/40' },
  { id: 'forum-management', icon: MessagesSquare, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', accentBorder: 'border-violet-500/40' },
  { id: 'polls', icon: BarChart, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', accentBorder: 'border-blue-500/40' },
  { id: 'reports', icon: Flag, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', accentBorder: 'border-orange-500/40' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Features — Arken Bot',
  description:
    'Explore every built-in feature Arken Bot offers: moderation, leveling, achievements, reputation, analytics, music, custom commands, reaction roles, stream alerts, giveaways, and more — all free, no paywalls.',
};

export default async function FeaturesPage() {
  const t = await getTranslations('featuresPage');
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
            {t('heroBadge')}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            {t.rich('heroTitle', {
              hl: (c) => (
                <span className="bg-gradient-to-r from-discord-blurple via-purple-400 to-blue-400 bg-clip-text text-transparent">
                  {c}
                </span>
              ),
            })}
          </h1>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed max-w-xl mx-auto">
            {t('heroSubtitle')}
          </p>

          {/* Quick jump links */}
          <div className="flex flex-wrap justify-center gap-2">
            {FEATURE_SECTIONS.map((f) => (
              <a
                key={f.id}
                href={`#${f.id}`}
                className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                {t(`sections.${f.id}.title`)}
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
                  <h2 className="text-white font-bold text-xl">{t(`sections.${f.id}.title`)}</h2>
                  <p className={`text-sm font-medium mt-0.5 ${f.color}`}>{t(`sections.${f.id}.tagline`)}</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6">
                <div>
                  <p className="text-gray-400 text-sm leading-relaxed mb-5">{t(`sections.${f.id}.description`)}</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {(t.raw(`sections.${f.id}.bullets`) as string[]).map((b) => (
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
            <p className="text-xs font-semibold text-fuchsia-400 uppercase tracking-widest mb-2">{t('calloutEyebrow')}</p>
            <h3 className="text-white font-bold text-xl mb-2">{t('calloutHeading')}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              {t('calloutSubtitle')}
            </p>
          </div>
          <Link
            href="/addons"
            className="btn-secondary shrink-0 inline-flex items-center gap-2 px-6 py-2.5 text-sm whitespace-nowrap"
          >
            {t('browseAddons')} <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* ── CTA ── */}
      <section className="py-20 px-6 text-center border-t border-white/[0.04] bg-discord-darker-bg/30">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
            {t('ctaHeading')}
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            {t('ctaSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={SITE.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-[15px] px-10 py-3 shadow-lg shadow-discord-blurple/20 inline-flex items-center gap-2 justify-center"
            >
              {t('ctaAddButton')} <ArrowRight className="w-4 h-4" />
            </a>
            <Link href="/auth" className="btn-secondary text-[15px] px-10 py-3 inline-flex items-center gap-2 justify-center">
              {t('ctaOpenDashboard')} <ChevronRight className="w-4 h-4" />
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
            <Link href="/" className="hover:text-gray-300 transition-colors">{t('footHome')}</Link>
            <Link href="/features" className="hover:text-gray-300 transition-colors text-gray-300">{t('footFeatures')}</Link>
            <Link href="/auth" className="hover:text-gray-300 transition-colors">{t('footDashboard')}</Link>
            <a href={SITE.docsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors flex items-center gap-1">
              {t('footDocs')} <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">{t('footSupport')}</a>
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">{t('footPrivacy')}</Link>
            <Link href="/terms" className="hover:text-gray-300 transition-colors">{t('footTerms')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
