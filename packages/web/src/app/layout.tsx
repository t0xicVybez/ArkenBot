import type { Metadata } from 'next';
import { Inter, Space_Grotesk, Manrope, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';
import '../styles/tokens.v2.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// v2 typefaces — expose as CSS variables; only applied inside a `.v2` subtree.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['500', '600', '700'],
  display: 'swap',
});
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Arken Bot — Free Discord Bot',
    template: '%s | Arken Bot',
  },
  description:
    'Arken Bot is a completely free Discord bot with moderation, leveling, tickets, stream alerts, Trello & Monday.com integrations, temp voice, and a real-time web dashboard. No paywalls, no premium tiers — ever.',
  icons: { icon: '/icon.svg' },
  metadataBase: new URL('https://arkenbot.app'),
  openGraph: {
    type: 'website',
    siteName: 'Arken Bot',
    title: 'Arken Bot — Free Discord Bot',
    description:
      'Moderation, leveling, tickets, stream alerts, integrations, and a real-time web dashboard. Completely free, no paywalls.',
    url: 'https://arkenbot.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arken Bot — Free Discord Bot',
    description:
      'Moderation, leveling, tickets, stream alerts, integrations, and a real-time web dashboard. Completely free, no paywalls.',
  },
  verification: {
    google: '5HXI9HfbW5APt8TluWCjhjDfwp0WNl6vuF-3zwVIrB8',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`v2 dark ${inter.variable} ${spaceGrotesk.variable} ${manrope.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
