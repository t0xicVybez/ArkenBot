import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/LandingNav';

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

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-[var(--text-muted)]">Last updated: {LAST_UPDATED}</p>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-10">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Arken Bot (the &ldquo;Bot&rdquo;) and the
          web dashboard at{' '}
          <a href="https://arkenbot.app" className="text-discord-blurple hover:underline">arkenbot.app</a>{' '}
          (the &ldquo;Service&rdquo;), operated by Arken Bot (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;).
          By adding the Bot to your Discord server or using the Service, you agree to these Terms.
          If you do not agree, do not use the Service.
        </p>

        <Section id="eligibility" title="1. Eligibility">
          <p>
            You must be at least 13 years old (or the minimum age required in your jurisdiction) to use the Service.
            By using the Service you represent that you meet this requirement. Use of the Service is also subject to
            Discord&apos;s{' '}
            <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Terms of Service
            </a>; you are responsible for complying with Discord&apos;s policies independently of these Terms.
          </p>
        </Section>

        <Section id="use" title="2. Permitted Use">
          <p>You may use Arken Bot to manage your Discord server in accordance with these Terms and all applicable laws. You agree not to:</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>Use the Service to harass, abuse, threaten, or harm any person</li>
            <li>Attempt to circumvent, disable, or interfere with security features of the Service</li>
            <li>Use the Service to distribute spam, malware, or unsolicited commercial messages</li>
            <li>Reverse-engineer, decompile, or attempt to extract source code from the Bot</li>
            <li>Use the Service in any way that violates Discord&apos;s Terms of Service or Community Guidelines</li>
            <li>Resell, sublicense, or commercially exploit the Service without our written permission</li>
          </ul>
        </Section>

        <Section id="youtube" title="3. YouTube API Services">
          <p>
            Arken Bot uses the{' '}
            <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              YouTube Data API v3
            </a>{' '}
            to provide YouTube live stream notifications. By enabling YouTube features in Arken Bot, you agree to be
            bound by the{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              YouTube Terms of Service
            </a>.
          </p>
          <p>
            Arken Bot accesses only publicly available YouTube video metadata (video title, live status, and thumbnail)
            for the purpose of sending notifications to Discord channels configured by server administrators.
            We do not use YouTube API Services to upload content, access private data, or manage YouTube accounts.
          </p>
          <p>
            Google&apos;s privacy policy applies to data processed through YouTube API Services:{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              policies.google.com/privacy
            </a>.
          </p>
        </Section>

        <Section id="reddit" title="4. Reddit Data API">
          <p>
            Arken Bot uses the{' '}
            <a href="https://www.reddit.com/dev/api/" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Reddit Data API
            </a>{' '}
            to provide subreddit feed notifications. By enabling Reddit features in Arken Bot, you acknowledge that
            this functionality is subject to the{' '}
            <a href="https://www.redditinc.com/policies/data-api-terms" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Reddit Data API Terms
            </a>{' '}
            and the{' '}
            <a href="https://www.redditinc.com/policies/user-agreement" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Reddit User Agreement
            </a>.
          </p>
          <p>
            Arken Bot accesses only publicly available post metadata (post title, link, and author username) from
            subreddits configured by server administrators, for the sole purpose of sending notifications to Discord
            channels. We do not access Reddit user accounts, private communities, or post content beyond public
            metadata, and we do not archive or redistribute Reddit content.
          </p>
          <p>
            Reddit&apos;s privacy policy applies to data processed through the Reddit Data API:{' '}
            <a href="https://www.reddit.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              reddit.com/policies/privacy-policy
            </a>.
          </p>
        </Section>

        <Section id="integrations" title="5. Monday.com and Trello Integrations">
          <p>
            Arken Bot can receive webhook notifications from{' '}
            <a href="https://monday.com" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">monday.com</a>{' '}
            and{' '}
            <a href="https://trello.com" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">Trello</a>{' '}
            boards connected by server administrators, and relay them as Discord notifications. By enabling these
            features you acknowledge that your use of the underlying platforms remains subject to the{' '}
            <a href="https://monday.com/l/legal/tos/" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              monday.com Terms of Service
            </a>{' '}
            and the{' '}
            <a href="https://www.atlassian.com/legal/cloud-terms-of-service" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
              Atlassian Cloud Terms of Service
            </a>{' '}
            respectively.
          </p>
          <p>
            You are responsible for ensuring you have the right to connect a given board and to share its activity
            with the members of your Discord server. Webhook payloads are processed transiently to build
            notifications and are not stored; see our{' '}
            <Link href="/privacy" className="text-discord-blurple hover:underline">Privacy Policy</Link>{' '}
            for details on what configuration data we retain.
          </p>
        </Section>

        <Section id="content" title="6. User Content and Responsibility">
          <p>
            You are solely responsible for all content configured through the Service, including custom bot messages,
            moderation actions, and alert configurations. We do not review or endorse user-generated configurations.
          </p>
          <p>
            Server administrators who add Arken Bot to their Discord server are responsible for ensuring their use of the
            Bot complies with applicable laws and Discord&apos;s policies, including rules regarding moderation,
            data collection from minors, and member privacy.
          </p>
        </Section>

        <Section id="availability" title="7. Service Availability">
          <p>
            Arken Bot is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not guarantee
            uninterrupted, error-free operation. We may suspend or discontinue the Service at any time without notice
            for maintenance, security, or any other reason.
          </p>
          <p>
            We are not liable for any loss resulting from downtime, missed notifications (including stream alerts),
            or data loss caused by service interruptions.
          </p>
        </Section>

        <Section id="termination" title="8. Termination">
          <p>
            We reserve the right to remove Arken Bot from any Discord server, or suspend access for any user or server,
            at our sole discretion if we determine these Terms have been violated. You may remove the Bot from your
            server at any time through Discord&apos;s server settings.
          </p>
          <p>
            Upon removal or termination, you may request deletion of all associated data by contacting us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-discord-blurple hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section id="disclaimer" title="9. Disclaimer of Warranties">
          <p>
            The Service is provided without warranties of any kind, express or implied, including but not limited to
            warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant
            that the Service will meet your requirements or that it will be secure, uninterrupted, or free of errors.
          </p>
        </Section>

        <Section id="liability" title="10. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, Arken Bot and its operators shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability
            to use the Service, even if advised of the possibility of such damages.
          </p>
        </Section>

        <Section id="changes" title="11. Changes to These Terms">
          <p>
            We may update these Terms at any time. The &ldquo;Last updated&rdquo; date at the top of this page reflects
            when changes were most recently made. Continued use of the Service after changes are posted constitutes
            acceptance of the updated Terms.
          </p>
        </Section>

        <Section id="contact" title="12. Contact">
          <p>
            If you have questions about these Terms, contact us at{' '}
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
            <Link href="/changelog" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Changelog</Link>
            <Link href="/privacy" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Terms of Service</Link>
            <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
