import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/LandingNav';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Arken Bot — how we collect, use, and protect your data.',
};

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';

const SITE = {
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

const LAST_UPDATED = 'July 12, 2026';
const CONTACT_EMAIL = 'support@arkenbot.app';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-lg font-semibold text-white mb-3 pb-2 border-b border-[var(--border-subtle)]">{title}</h2>
      <div className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">{children}</div>
    </section>
  );
}

/** Renderer helpers for next-intl rich text. */
const extLink = (href: string) => (chunks: ReactNode) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">{chunks}</a>
);
const intLink = (href: string) => (chunks: ReactNode) => (
  <a href={href} className="text-discord-blurple hover:underline">{chunks}</a>
);
/** Inline formatting tags shared across every rich paragraph. */
const fmt = {
  b: (chunks: ReactNode) => <span className="text-white font-medium">{chunks}</span>,
  w: (chunks: ReactNode) => <span className="text-white">{chunks}</span>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
  code: (chunks: ReactNode) => <code className="text-xs bg-white/10 px-1 py-0.5 rounded">{chunks}</code>,
};

export default async function PrivacyPage() {
  const t = await getTranslations('privacyPage');

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">{t('title')}</h1>
          <p className="text-sm text-[var(--text-muted)]">{t('lastUpdated', { date: LAST_UPDATED })}</p>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-10">
          {t.rich('intro', { ...fmt, site: extLink('https://arkenbot.app') })}
        </p>

        <Section id="data-collected" title={t('s1Title')}>
          <p>{t('s1Intro')}</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>{t.rich('s1Item1', fmt)}</li>
            <li>{t.rich('s1Item2', fmt)}</li>
            <li>{t.rich('s1Item3', fmt)}</li>
            <li>{t.rich('s1Item4', fmt)}</li>
            <li>{t.rich('s1Item5', fmt)}</li>
          </ul>
          <p>{t('s1Outro')}</p>
        </Section>

        <Section id="cookies" title={t('s2Title')}>
          <p>{t('s2Intro')}</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>{t.rich('s2Item1', fmt)}</li>
            <li>{t.rich('s2Item2', fmt)}</li>
            <li>{t.rich('s2Item3', fmt)}</li>
          </ul>
          <p>{t('s2Outro')}</p>
        </Section>

        <Section id="youtube" title={t('s3Title')}>
          <p>{t.rich('s3p1', { ...fmt, api: extLink('https://developers.google.com/youtube/v3'), tos: extLink('https://www.youtube.com/t/terms'), privacy: extLink('https://policies.google.com/privacy') })}</p>
          <p>{t.rich('s3p2', fmt)}</p>
          <p>{t.rich('s3p3', fmt)}</p>
          <p>{t.rich('s3p4', fmt)}</p>
          <p>{t.rich('s3p5', fmt)}</p>
          <p>{t.rich('s3p6', fmt)}</p>
          <p>{t.rich('s3p7', { ...fmt, email: extLink(`mailto:${CONTACT_EMAIL}`) })}</p>
        </Section>

        <Section id="reddit" title={t('s4Title')}>
          <p>{t.rich('s4p1', { ...fmt, api: extLink('https://www.reddit.com/dev/api/'), terms: extLink('https://www.redditinc.com/policies/data-api-terms'), privacy: extLink('https://www.reddit.com/policies/privacy-policy') })}</p>
          <p>{t.rich('s4p2', fmt)}</p>
          <p>{t.rich('s4p3', fmt)}</p>
          <p>{t.rich('s4p4', fmt)}</p>
          <p>{t.rich('s4p5', fmt)}</p>
          <p>{t.rich('s4p6', fmt)}</p>
        </Section>

        <Section id="monday" title={t('s5Title')}>
          <p>{t.rich('s5p1', { ...fmt, monday: extLink('https://monday.com'), tos: extLink('https://monday.com/l/legal/tos/'), privacy: extLink('https://monday.com/l/privacy/privacy-policy/') })}</p>
          <p>{t.rich('s5p2', fmt)}</p>
          <p>{t.rich('s5p3', fmt)}</p>
          <p>{t.rich('s5p4', fmt)}</p>
        </Section>

        <Section id="trello" title={t('s6Title')}>
          <p>{t.rich('s6p1', { ...fmt, trello: extLink('https://trello.com'), tos: extLink('https://www.atlassian.com/legal/cloud-terms-of-service'), privacy: extLink('https://www.atlassian.com/legal/privacy-policy') })}</p>
          <p>{t.rich('s6p2', fmt)}</p>
          <p>{t.rich('s6p3', fmt)}</p>
          <p>{t.rich('s6p4', fmt)}</p>
        </Section>

        <Section id="ai" title={t('s7Title')}>
          <p>{t.rich('s7p1', { ...fmt, groq: extLink('https://groq.com'), privacy: extLink('https://groq.com/privacy-policy/'), terms: extLink('https://groq.com/terms-of-use/') })}</p>
          <p>{t.rich('s7p2', fmt)}</p>
          <p>{t.rich('s7p3', fmt)}</p>
          <p>{t.rich('s7p4', fmt)}</p>
          <p>{t.rich('s7p5', fmt)}</p>
          <p>{t.rich('s7p6', fmt)}</p>
        </Section>

        <Section id="how-we-use" title={t('s8Title')}>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            {(t.raw('s8list') as string[]).map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>{t('s8Outro')}</p>
        </Section>

        <Section id="data-sharing" title={t('s9Title')}>
          <p>{t('s9Intro')}</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>{t.rich('s9Item1', fmt)}</li>
            <li>{t.rich('s9Item2', { ...fmt, sec: intLink('#youtube') })}</li>
            <li>{t.rich('s9Item3', { ...fmt, sec: intLink('#reddit') })}</li>
            <li>{t.rich('s9Item4', { ...fmt, sec: intLink('#monday') })}</li>
            <li>{t.rich('s9Item5', { ...fmt, sec: intLink('#trello') })}</li>
            <li>{t.rich('s9Item6', { ...fmt, sec: intLink('#ai') })}</li>
            <li>{t.rich('s9Item7', fmt)}</li>
          </ul>
        </Section>

        <Section id="retention" title={t('s10Title')}>
          <p>{t('s10p1')}</p>
          <p>{t.rich('s10p2', fmt)}</p>
          <p>{t.rich('s10p3', { ...fmt, email: extLink(`mailto:${CONTACT_EMAIL}`) })}</p>
          <p>{t.rich('s10p4', { ...fmt, sec: intLink('#youtube') })}</p>
        </Section>

        <Section id="security" title={t('s11Title')}>
          <p>{t('s11p1')}</p>
        </Section>

        <Section id="childrens" title={t('s12Title')}>
          <p>{t('s12p1')}</p>
        </Section>

        <Section id="changes" title={t('s13Title')}>
          <p>{t('s13p1')}</p>
        </Section>

        <Section id="contact" title={t('s14Title')}>
          <p>{t.rich('s14p1', { ...fmt, email: extLink(`mailto:${CONTACT_EMAIL}`), support: extLink(SITE.supportUrl) })}</p>
        </Section>
      </main>

      <Footer supportUrl={SITE.supportUrl} />
    </div>
  );
}
