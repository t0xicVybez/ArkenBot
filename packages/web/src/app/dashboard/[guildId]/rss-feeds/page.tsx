import { getTranslations } from 'next-intl/server';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

// Server component: resolves translations + builds the (static) platform config
// on the server; only the interactive FeedAlertsPage ships to the client.
export default async function RssFeedsPage() {
  const t = await getTranslations('rssFeeds');
  const PLATFORMS = [
    {
      value: 'rss',
      label: 'RSS',
      badgeClass: 'bg-yellow-500/15 text-yellow-400',
      usernameLabel: t('usernameLabel'),
      usernamePlaceholder: 'https://example.com/feed.xml',
      variables: '{feed} = feed title · {title} = item title · {url} = item link',
      messagePlaceholder: 'e.g. New post from {feed}: {title} — {url}',
    },
  ];
  return (
    <FeedAlertsPage
      title={t('title')}
      description={t('description')}
      icon="rss"
      iconColor="text-yellow-400"
      platforms={PLATFORMS}
    />
  );
}
