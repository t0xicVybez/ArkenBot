'use client';

import { AtSign } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';
import { useTranslations } from 'next-intl';

export default function TwitterFeedsPage() {
  const t = useTranslations('twitterFeeds');
  const PLATFORMS = [
    {
      value: 'twitter',
      label: 'X / Twitter',
      badgeClass: 'bg-gray-500/15 text-gray-300',
      usernameLabel: t('usernameLabel'),
      usernamePlaceholder: 'e.g. @shroud or shroud',
      variables: '{streamer} = @handle · {title} = tweet text · {url} = tweet link',
      messagePlaceholder: 'e.g. New tweet from {streamer}: {url}',
    },
  ];
  return (
    <FeedAlertsPage
      title={t('title')}
      description={t('description')}
      icon={AtSign}
      iconColor="text-gray-300"
      platforms={PLATFORMS}
      notice={t('notice')}
    />
  );
}
