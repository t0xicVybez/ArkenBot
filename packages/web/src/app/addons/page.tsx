import Link from 'next/link';
import {
  Puzzle, ArrowRight, ChevronRight, ExternalLink,
  Check, Zap, Code2, Shield, Ticket,
  Terminal, Package, BookOpen, Globe,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/LandingNav';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';

const SITE = {
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

// Visual config only — text (title, tagline, description, bullets) comes from
// the `addonsPage.addons.<id>` message objects.
const FIRST_PARTY_ADDONS = [
  {
    id: 'tickets',
    icon: Ticket,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    accentBorder: 'border-cyan-500/40',
    badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  },
  {
    id: 'gameservers',
    icon: Globe,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    accentBorder: 'border-sky-500/40',
    badgeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  },
  {
    id: 'code-review',
    icon: Code2,
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    accentBorder: 'border-fuchsia-500/40',
    badgeColor: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
  },
];

const SDK_ICONS = [Package, Terminal, BookOpen, Shield, Zap, Code2];

export const metadata = {
  title: 'Addons — Arken Bot',
  description:
    'Explore Arken Bot first-party addons: Ticket System, Game Server Status, and Code Review. Or build your own with the Arken Addon SDK.',
};

export default async function AddonsPage() {
  const t = await getTranslations('addonsPage');
  const sdkFeatures = t.raw('sdkFeatures') as string[];
  return (
    <div className="min-h-screen bg-discord-darkest-bg text-gray-200 flex flex-col">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-fuchsia-500/[0.05] rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-xs font-medium mb-6">
            <Puzzle className="w-3 h-3" />
            {t('heroBadge')}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            {t.rich('heroTitle', {
              hl: (c) => (
                <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                  {c}
                </span>
              ),
            })}
          </h1>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed max-w-xl mx-auto">
            {t('heroSubtitle')}
          </p>

          {/* Jump links */}
          <div className="flex flex-wrap justify-center gap-2">
            {FIRST_PARTY_ADDONS.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                {t(`addons.${a.id}.title`)}
              </a>
            ))}
            <a
              href="#sdk"
              className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              {t('buildYourOwn')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Addon cards ── */}
      <div className="max-w-5xl mx-auto px-6 pb-16 space-y-6">
        {FIRST_PARTY_ADDONS.map((a, idx) => {
          const Icon = a.icon;
          return (
            <section
              key={a.id}
              id={a.id}
              className={`rounded-2xl border border-white/[0.08] overflow-hidden scroll-mt-20 ${
                idx % 2 === 0 ? 'bg-discord-darker-bg' : 'bg-discord-darker-bg/60'
              }`}
            >
              {/* Header */}
              <div className={`flex items-start gap-4 p-6 border-b border-white/[0.06] ${a.bg}`}>
                <div className={`w-11 h-11 rounded-xl ${a.bg} border ${a.accentBorder} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${a.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-white font-bold text-xl">{t(`addons.${a.id}.title`)}</h2>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${a.badgeColor}`}>
                      {t('official')}
                    </span>
                  </div>
                  <p className={`text-sm font-medium mt-0.5 ${a.color}`}>{t(`addons.${a.id}.tagline`)}</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6">
                <p className="text-gray-400 text-sm leading-relaxed mb-5">{t(`addons.${a.id}.description`)}</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {(t.raw(`addons.${a.id}.bullets`) as string[]).map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <span className={`w-4 h-4 rounded-full ${a.bg} border ${a.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Check className={`w-2.5 h-2.5 ${a.color}`} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      {/* ── SDK section ── */}
      <section id="sdk" className="scroll-mt-20 border-t border-white/[0.06] bg-discord-darker-bg/30 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-xs font-medium mb-5">
                <Code2 className="w-3 h-3" />
                {t('sdkBadge')}
              </div>
              <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">
                {t('sdkHeading')}
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                {t('sdkDescription')}
              </p>
              <a
                href={SITE.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                {t('readSdkDocs')} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="space-y-3">
              {SDK_ICONS.map((SIcon, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-4 rounded-xl bg-discord-darker-bg border border-white/[0.06]"
                >
                  <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center flex-shrink-0">
                    <SIcon className="w-4 h-4 text-fuchsia-400" />
                  </div>
                  <p className="text-sm text-gray-300 leading-snug">{sdkFeatures[i]}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
            <Link href="/features" className="btn-secondary text-[15px] px-10 py-3 inline-flex items-center gap-2 justify-center">
              {t('viewAllFeatures')} <ChevronRight className="w-4 h-4" />
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
            <Link href="/features" className="hover:text-gray-300 transition-colors">{t('footFeatures')}</Link>
            <Link href="/addons" className="hover:text-gray-300 transition-colors text-gray-300">{t('footAddons')}</Link>
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
