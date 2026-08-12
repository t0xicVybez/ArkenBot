'use client';

import { Rss } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';
import { useTranslations } from 'next-intl';

export default function RssFeedsPage() {
  const t = useTranslations('rssFeeds');
  const PLATFORMS = [
    {
      value: 'rss',
      label: 'RSS',
      badgeClass: 'bg-yellow-500/15 text-yellow-400',
      usernameLabel: t('usernameLabel'),
      usernamePlaceholder: 'https://example.com/feed.xml',
      variables: '{streamer} = feed title · {title} = item title · {url} = item link',
      messagePlaceholder: 'e.g. New post from {streamer}: {title} — {url}',
    },
  ];
  return (
    <FeedAlertsPage
      title={t('title')}
      description={t('description')}
      icon={Rss}
      iconColor="text-yellow-400"
      platforms={PLATFORMS}
    />
  );
}
