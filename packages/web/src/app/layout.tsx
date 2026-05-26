import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Arken Bot — Free Discord Bot',
    template: '%s | Arken Bot',
  },
  description:
    'Arken Bot is a completely free Discord bot with moderation, leveling, tickets, game server management, auto-responses, and a real-time web dashboard. No paywalls, no premium tiers — ever.',
  icons: { icon: '/icon.svg' },
  metadataBase: new URL('https://arkenbot.app'),
  openGraph: {
    type: 'website',
    siteName: 'Arken Bot',
    title: 'Arken Bot — Free Discord Bot',
    description:
      'Moderation, leveling, tickets, game server management, auto-responses, and a real-time web dashboard. Completely free, no paywalls.',
    url: 'https://arkenbot.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arken Bot — Free Discord Bot',
    description:
      'Moderation, leveling, tickets, game server management, auto-responses, and a real-time web dashboard. Completely free, no paywalls.',
  },
  verification: {
    google: '5HXI9HfbW5APt8TluWCjhjDfwp0WNl6vuF-3zwVIrB8',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
