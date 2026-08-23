import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/LandingNav';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Arken Bot — rules and guidelines for using our Discord bot and web dashboard.',
};

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';

const SITE = {
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

const LAST_UPDATED = 'July 5, 2026';
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

export default async function TermsPage() {
  const t = await getTranslations('termsPage');

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">{t('title')}</h1>
          <p className="text-sm text-[var(--text-muted)]">{t('lastUpdated', { date: LAST_UPDATED })}</p>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-10">
          {t.rich('intro', { site: extLink('https://arkenbot.app') })}
        </p>

        <Section id="eligibility" title={t('s1Title')}>
          <p>{t.rich('s1p1', { tos: extLink('https://discord.com/terms') })}</p>
        </Section>

        <Section id="use" title={t('s2Title')}>
          <p>{t('s2p1')}</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            {(t.raw('s2list') as string[]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>

        <Section id="youtube" title={t('s3Title')}>
          <p>{t.rich('s3p1', { api: extLink('https://developers.google.com/youtube/v3'), tos: extLink('https://www.youtube.com/t/terms') })}</p>
          <p>{t('s3p2')}</p>
          <p>{t.rich('s3p3', { privacy: extLink('https://policies.google.com/privacy') })}</p>
        </Section>

        <Section id="integrations" title={t('s5Title')}>
          <p>{t.rich('s5p1', { monday: extLink('https://monday.com'), trello: extLink('https://trello.com'), mondayTos: extLink('https://monday.com/l/legal/tos/'), atlassian: extLink('https://www.atlassian.com/legal/cloud-terms-of-service') })}</p>
          <p>{t.rich('s5p2', { privacy: (chunks: ReactNode) => <Link href="/privacy" className="text-discord-blurple hover:underline">{chunks}</Link> })}</p>
        </Section>

        <Section id="content" title={t('s6Title')}>
          <p>{t('s6p1')}</p>
          <p>{t('s6p2')}</p>
        </Section>

        <Section id="availability" title={t('s7Title')}>
          <p>{t('s7p1')}</p>
          <p>{t('s7p2')}</p>
        </Section>

        <Section id="termination" title={t('s8Title')}>
          <p>{t('s8p1')}</p>
          <p>{t.rich('s8p2', { email: extLink(`mailto:${CONTACT_EMAIL}`) })}</p>
        </Section>

        <Section id="disclaimer" title={t('s9Title')}>
          <p>{t('s9p1')}</p>
        </Section>

        <Section id="liability" title={t('s10Title')}>
          <p>{t('s10p1')}</p>
        </Section>

        <Section id="changes" title={t('s11Title')}>
          <p>{t('s11p1')}</p>
        </Section>

        <Section id="contact" title={t('s12Title')}>
          <p>{t.rich('s12p1', { email: extLink(`mailto:${CONTACT_EMAIL}`), support: extLink(SITE.supportUrl) })}</p>
        </Section>
      </main>

      <Footer supportUrl={SITE.supportUrl} />
    </div>
  );
}
