import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/LandingNav';
import { Footer } from '@/components/Footer';
import { ShieldCheck, Trophy, BellRing, LinkIcon, Gamepad2, ArrowRight } from 'lucide-react';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';
const SITE = {
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675953536247&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675953536247&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

const VAL_RED = '#ff4655';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('valorantPage');
  return { title: `${t('metaTitle')} · ArkenBot`, description: t('metaDesc') };
}

/** A little faux-Discord card used to visually demonstrate the planned UX. */
function Mock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--bg-card) p-4 shadow-lg">{children}</div>
  );
}

export default async function ValorantPage() {
  const t = await getTranslations('valorantPage');

  const steps = [
    { icon: LinkIcon, key: 'step1' },
    { icon: Gamepad2, key: 'step2' },
    { icon: ShieldCheck, key: 'step3' },
    { icon: Trophy, key: 'step4' },
    { icon: BellRing, key: 'step5' },
  ] as const;

  return (
    <div className="min-h-screen bg-(--bg-base) text-(--text-primary)">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Hero */}
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${VAL_RED}1a`, color: VAL_RED }}>
              <Gamepad2 className="h-3.5 w-3.5" /> {t('badge')}
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-white">{t('heroTitle')}</h1>
            <p className="mt-4 text-base leading-relaxed text-(--text-secondary)">{t('heroSub')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={SITE.inviteUrl} target="_blank" rel="noopener noreferrer" className="btn-primary flex items-center gap-2">
                {t('ctaAdd')} <ArrowRight className="h-4 w-4" />
              </a>
              <a href={SITE.docsUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">{t('ctaDocs')}</a>
            </div>
          </div>

          {/* Hero mockup — a rank card */}
          <Mock>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg font-bold text-white" style={{ background: VAL_RED }}>V</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">Sova#NA1</p>
                <p className="text-xs text-(--text-muted)">{t('mockRegion')}</p>
              </div>
              <span className="ml-auto rounded-md px-2 py-1 text-xs font-bold" style={{ background: `${VAL_RED}1a`, color: VAL_RED }}>Immortal 2</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[['47', 'RR'], ['1.42', 'K/D'], ['Radiant', t('mockPeak')]].map(([v, l]) => (
                <div key={l} className="rounded-lg bg-(--bg-base) py-2">
                  <p className="text-sm font-bold text-white">{v}</p>
                  <p className="text-[10px] uppercase tracking-wide text-(--text-muted)">{l}</p>
                </div>
              ))}
            </div>
          </Mock>
        </div>

        {/* How it works */}
        <h2 className="mt-20 mb-8 text-center text-2xl font-bold text-white">{t('howTitle')}</h2>
        <div className="space-y-4">
          {steps.map(({ icon: Icon, key }, i) => (
            <div key={key} className="grid items-center gap-5 rounded-xl border border-(--border) bg-(--bg-card) p-5 md:grid-cols-[1fr_1.1fr]">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${VAL_RED}1a`, color: VAL_RED }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">{t('stepLabel', { n: i + 1 })}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-white">{t(`${key}Title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-(--text-secondary)">{t(`${key}Desc`)}</p>
              </div>

              {/* Per-step mockup */}
              <div>
                {key === 'step1' && (
                  <Mock>
                    <p className="mb-3 text-xs text-(--text-muted)">{t('mockLinkPrompt')}</p>
                    <div className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white" style={{ background: VAL_RED }}>
                      <LinkIcon className="h-4 w-4" /> {t('mockLinkBtn')}
                    </div>
                    <p className="mt-2 text-center text-[11px] text-(--text-muted)">{t('mockRso')}</p>
                  </Mock>
                )}
                {key === 'step2' && (
                  <Mock>
                    <p className="text-xs text-(--text-muted)">/valorant rank @you</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: `${VAL_RED}1a`, color: VAL_RED }}>Immortal 2</span>
                      <span className="text-xs text-(--text-secondary)">· 47 RR · K/D 1.42 · 12 {t('mockWins')}</span>
                    </div>
                  </Mock>
                )}
                {key === 'step3' && (
                  <Mock>
                    <div className="space-y-1.5 text-xs">
                      {[['Radiant', '@Radiant'], ['Immortal', '@Immortal'], ['Diamond', '@Diamond']].map(([tier, role]) => (
                        <div key={tier} className="flex items-center justify-between rounded-md bg-(--bg-base) px-3 py-1.5">
                          <span className="font-semibold text-white">{tier}</span>
                          <ArrowRight className="h-3 w-3 text-(--text-muted)" />
                          <span style={{ color: VAL_RED }}>{role}</span>
                        </div>
                      ))}
                    </div>
                  </Mock>
                )}
                {key === 'step4' && (
                  <Mock>
                    <div className="space-y-1 text-xs">
                      {[['1', 'Jett#EU', 'Radiant'], ['2', 'Sova#NA1', 'Immortal 2'], ['3', 'Sage#AP', 'Diamond 3']].map(([n, name, rank]) => (
                        <div key={n} className="flex items-center gap-3 rounded-md bg-(--bg-base) px-3 py-1.5">
                          <span className="w-4 font-bold text-(--text-muted)">{n}</span>
                          <span className="flex-1 truncate text-white">{name}</span>
                          <span style={{ color: VAL_RED }}>{rank}</span>
                        </div>
                      ))}
                    </div>
                  </Mock>
                )}
                {key === 'step5' && (
                  <Mock>
                    <div className="flex items-start gap-2">
                      <BellRing className="mt-0.5 h-4 w-4" style={{ color: VAL_RED }} />
                      <p className="text-xs text-(--text-secondary)">{t('mockAlert')}</p>
                    </div>
                  </Mock>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Privacy / opt-in */}
        <div className="mt-14 rounded-xl border border-(--border) bg-(--bg-card) p-6 text-center">
          <ShieldCheck className="mx-auto h-6 w-6" style={{ color: VAL_RED }} />
          <p className="mt-3 text-sm text-(--text-secondary)">
            {t.rich('privacyNote', {
              privacy: (c) => <Link href="/privacy" className="text-discord-blurple hover:underline">{c}</Link>,
              terms: (c) => <Link href="/terms" className="text-discord-blurple hover:underline">{c}</Link>,
            })}
          </p>
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-(--text-muted)">{t('disclaimer')}</p>
      </main>

      <Footer />
    </div>
  );
}
