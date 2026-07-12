import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/LandingNav';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Updates, new features, and fixes shipped to Arken Bot — straight from the team.',
};

// Re-fetch from the API every 5 minutes so new staff announcements appear
// without a redeploy.
export const revalidate = 300;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.arkenbot.app';

const SITE = {
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

type ChangelogEntry = {
  id: string;
  title: string;
  body: string;
  type: string;
  sentAt: string;
};

const TYPE_BADGES: Record<string, { label: string; classes: string }> = {
  update:      { label: 'Update',      classes: 'bg-discord-blurple/15 text-discord-blurple border-discord-blurple/30' },
  feature:     { label: 'New Feature', classes: 'bg-green-500/15 text-green-400 border-green-500/30' },
  maintenance: { label: 'Maintenance', classes: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  hotfix:      { label: 'Hotfix',      classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

async function getEntries(): Promise<ChangelogEntry[]> {
  try {
    const res = await fetch(`${API_URL}/public/changelog?limit=50`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { entries?: ChangelogEntry[] } };
    return json.data?.entries ?? [];
  } catch {
    return [];
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function ChangelogPage() {
  const entries = await getEntries();

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Changelog</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Every update, feature, and fix we announce — posted here the moment the team sends it out.
            Want these in your own server? Enable announcements in{' '}
            <span className="text-white">Dashboard → Announcements</span>.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No announcements yet — check back soon.</p>
        ) : (
          <div className="relative border-l border-[var(--border-subtle)] ml-2 space-y-10">
            {entries.map((entry) => {
              const badge = TYPE_BADGES[entry.type] ?? TYPE_BADGES.update;
              return (
                <article key={entry.id} className="relative pl-8">
                  <span className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-discord-blurple" aria-hidden />
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.classes}`}>
                      {badge.label}
                    </span>
                    <time dateTime={entry.sentAt} className="text-xs text-[var(--text-muted)]">
                      {formatDate(entry.sentAt)}
                    </time>
                  </div>
                  <h2 className="text-lg font-semibold text-white mb-2">{entry.title}</h2>
                  <div className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                    {entry.body}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-8 px-6 bg-[var(--bg-base)]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-[var(--text-muted)] text-xs">© {new Date().getFullYear()} Arken Bot. All rights reserved.</span>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/changelog" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Changelog</Link>
            <Link href="/status" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Status</Link>
            <Link href="/privacy" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Terms of Service</Link>
            <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
