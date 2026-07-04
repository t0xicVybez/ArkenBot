import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/LandingNav';

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

const LAST_UPDATED = 'July 4, 2025';
const CONTACT_EMAIL = 'support@arkenbot.app';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-lg font-semibold text-white mb-3 pb-2 border-b border-[var(--border-subtle)]">{title}</h2>
      <div className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-[var(--text-muted)]">Last updated: {LAST_UPDATED}</p>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-10">
          This Privacy Policy describes how Arken Bot (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects, uses, and
          protects information when you use our Discord bot and web dashboard at{' '}
          <a href="https://arkenbot.app" className="text-discord-blurple hover:underline">arkenbot.app</a>.
          By using Arken Bot you agree to the practices described here.
        </p>

        <Section id="data-collected" title="1. Information We Collect">
          <p>We collect only the minimum data needed to operate the bot:</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li><span className="text-white font-medium">Discord account data</span> — your Discord user ID, username, and avatar, obtained via Discord OAuth when you log in to the dashboard.</li>
            <li><span className="text-white font-medium">Guild (server) data</span> — server IDs, channel IDs, role IDs, and configuration settings entered by server administrators.</li>
            <li><span className="text-white font-medium">Message metadata</span> — message IDs and timestamps used for features such as starboard, scheduled messages, and moderation logs. We do not store message content.</li>
            <li><span className="text-white font-medium">Moderation records</span> — warnings, bans, kicks, and case notes created by server moderators.</li>
            <li><span className="text-white font-medium">XP and leveling data</span> — per-user XP totals and level history within each server.</li>
          </ul>
          <p>We do not collect payment information, email addresses (unless voluntarily provided for support), or any data from users who have not interacted with the bot in a server where it is active.</p>
        </Section>

        <Section id="cookies" title="2. Cookies and Local Storage">
          <p>When you use the Arken Bot web dashboard, your browser stores data using the mechanisms below. We do not use advertising cookies, tracking pixels, or third-party analytics services.</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>
              <span className="text-white font-medium">Authentication tokens (localStorage)</span> — after you log in via Discord OAuth, your session access token and refresh token are stored in your browser&apos;s <code className="text-xs bg-white/10 px-1 py-0.5 rounded">localStorage</code>. These are used exclusively to authenticate your requests to the Arken Bot API and are never shared with third parties.
            </li>
            <li>
              <span className="text-white font-medium">UI preferences (localStorage)</span> — settings such as which sidebar sections are collapsed are stored locally in your browser under the key <code className="text-xs bg-white/10 px-1 py-0.5 rounded">sidebar_collapsed</code>. This data is never transmitted to our servers.
            </li>
            <li>
              <span className="text-white font-medium">Session cookies</span> — your browser may store session-related cookies as part of standard HTTP communication with our API. We do not set advertising or tracking cookies.
            </li>
          </ul>
          <p>We do not use device fingerprinting, cross-site tracking, or any third-party analytics or advertising scripts. We do not load third-party tracking pixels or advertising networks. Web fonts are self-hosted and served from our own infrastructure; your browser does not make requests to external font CDNs.</p>
        </Section>

        <Section id="youtube" title="3. YouTube Data">
          <p>
            Arken Bot uses the{' '}
            <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              YouTube Data API v3
            </a>{' '}
            to power our YouTube live stream notification feature. Our use of YouTube data is governed by the{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              YouTube Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Google&apos;s Privacy Policy
            </a>.
          </p>
          <p><span className="text-white font-medium">What we access:</span> We request only public video metadata — specifically video title, live broadcast status (<code className="text-xs bg-white/10 px-1 py-0.5 rounded">liveBroadcastContent</code>), and thumbnail URL — using the <code className="text-xs bg-white/10 px-1 py-0.5 rounded">snippet</code> and <code className="text-xs bg-white/10 px-1 py-0.5 rounded">liveStreamingDetails</code> resource parts. We do <strong>not</strong> request the <code className="text-xs bg-white/10 px-1 py-0.5 rounded">statistics</code> resource part and do not store, display, or process view counts, subscriber counts, like counts, or any other YouTube statistics. We do not access private videos, upload videos, manage YouTube accounts, or read any user&apos;s YouTube account data.</p>
          <p><span className="text-white font-medium">No OAuth:</span> We do not request YouTube OAuth scopes. All YouTube API calls are server-side requests using an API key against publicly available video data.</p>
          <p><span className="text-white font-medium">Data refresh cadence:</span> Our bot polls the YouTube Data API v3 every 5 minutes per configured alert. Each poll fetches fresh data from YouTube&apos;s servers; we do not cache API responses between polls. When a live stream ends, the stored video ID is cleared within the next poll cycle (within 5 minutes). As an additional safeguard, any stored YouTube video ID that has not been cleared within 30 days is automatically purged from our database.</p>
          <p><span className="text-white font-medium">Data stored:</span> We store only a single YouTube video ID per configured alert, used solely to prevent sending duplicate notifications for the same livestream. This is a plain identifier string; it is not a statistic. It is stored until the stream ends (typically hours), deleted when the alert is removed by a server administrator, deleted when the bot is removed from a server, and automatically purged after 30 days in all cases.</p>
          <p><span className="text-white font-medium">No redistribution:</span> YouTube data is used only to trigger a Discord notification embed containing the video title, thumbnail, and link. We do not store, cache beyond the current poll cycle, or redistribute YouTube media or content.</p>
          <p>
            You can revoke Arken Bot&apos;s access to any server configuration at any time by removing the bot from your Discord server or deleting your alert configurations via the dashboard. To request deletion of all data associated with your server, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-discord-blurple hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section id="reddit" title="4. Reddit Data">
          <p>
            Arken Bot uses the{' '}
            <a href="https://www.reddit.com/dev/api/" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Reddit Data API
            </a>{' '}
            to power our Reddit feed notification feature. Our use of Reddit data is governed by the{' '}
            <a href="https://www.redditinc.com/policies/data-api-terms" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Reddit Data API Terms
            </a>{' '}
            and{' '}
            <a href="https://www.reddit.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Reddit&apos;s Privacy Policy
            </a>.
          </p>
          <p><span className="text-white font-medium">What we access:</span> We fetch only public post metadata — post ID, title, permalink, and author username — from the newest posts of subreddits that server administrators choose to follow. We do not access private communities, direct messages, votes, or any Reddit account data.</p>
          <p><span className="text-white font-medium">No user accounts:</span> All Reddit API calls use application-only OAuth credentials. We never request access to any user&apos;s Reddit account, and no Reddit login is ever involved.</p>
          <p><span className="text-white font-medium">Data refresh cadence:</span> Feeds are polled every 5 minutes. Each poll fetches fresh data directly from Reddit; responses are not cached between polls.</p>
          <p><span className="text-white font-medium">Data stored:</span> We store only the ID of the most recently notified post per configured feed, used solely to prevent duplicate notifications. It is deleted when a server administrator removes the feed or the bot is removed from the server.</p>
          <p><span className="text-white font-medium">No redistribution:</span> Reddit data is used only to trigger a Discord notification containing the post title, a link back to Reddit, and the author&apos;s public username. We do not store, archive, or redistribute Reddit content.</p>
        </Section>

        <Section id="how-we-use" title="5. How We Use Your Data">
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>To operate bot features configured by server administrators (moderation, leveling, alerts, etc.)</li>
            <li>To display your server&apos;s dashboard and settings on the web interface</li>
            <li>To send Discord notifications when configured triggers occur (stream alerts, birthdays, scheduled messages)</li>
            <li>To maintain moderation records and audit logs within your server</li>
          </ul>
          <p>We do not sell, share, or license your data to third parties for advertising or marketing purposes.</p>
        </Section>

        <Section id="data-sharing" title="6. Data Sharing">
          <p>We share data only with the following service providers necessary to operate the bot:</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li><span className="text-white font-medium">Discord</span> — to operate the bot and authenticate dashboard users via OAuth.</li>
            <li><span className="text-white font-medium">Google / YouTube</span> — public video metadata API calls for stream alert notifications. See <a href="#youtube" className="text-discord-blurple hover:underline">Section 3</a>.</li>
            <li><span className="text-white font-medium">Reddit</span> — public post metadata API calls for feed notifications. See <a href="#reddit" className="text-discord-blurple hover:underline">Section 4</a>.</li>
            <li><span className="text-white font-medium">Infrastructure providers</span> — hosting, database, and CDN providers bound by their own privacy policies and data processing agreements.</li>
          </ul>
        </Section>

        <Section id="retention" title="7. Data Retention and Deletion">
          <p>
            Server configuration and moderation data is retained for as long as the bot remains in your Discord server. When the bot is removed from a server, data associated with that server is eligible for deletion upon request.
          </p>
          <p>
            To request deletion of all data associated with your Discord server or user account, please contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-discord-blurple hover:underline">{CONTACT_EMAIL}</a>.
            We will process deletion requests within 30 days.
          </p>
          <p>
            YouTube-related data (last notified video IDs) is cleared within minutes of a stream ending, deleted when the associated alert is removed by a server administrator, and automatically purged after 30 days as a safeguard. See <a href="#youtube" className="text-discord-blurple hover:underline">Section 3</a> for details.
          </p>
        </Section>

        <Section id="security" title="8. Security">
          <p>
            We use industry-standard security measures including encrypted connections (HTTPS/TLS), access-controlled databases, and server-side API key storage to protect your data. No internet transmission is 100% secure, and we cannot guarantee absolute security.
          </p>
        </Section>

        <Section id="childrens" title="9. Children's Privacy">
          <p>
            Arken Bot is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us immediately.
          </p>
        </Section>

        <Section id="changes" title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. The &ldquo;Last updated&rdquo; date at the top of this page reflects when the most recent changes were made. Continued use of Arken Bot after changes are posted constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section id="contact" title="11. Contact">
          <p>
            If you have questions about this Privacy Policy or want to request data deletion, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-discord-blurple hover:underline">{CONTACT_EMAIL}</a>{' '}
            or join our{' '}
            <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              support server
            </a>.
          </p>
        </Section>
      </main>

      <footer className="border-t border-[var(--border)] py-8 px-6 bg-[var(--bg-base)]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-[var(--text-muted)] text-xs">© {new Date().getFullYear()} Arken Bot. All rights reserved.</span>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/privacy" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Terms of Service</Link>
            <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
