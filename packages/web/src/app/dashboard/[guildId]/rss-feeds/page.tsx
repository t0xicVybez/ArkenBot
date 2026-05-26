'use client';

import { Rss } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

const PLATFORMS = [
  {
    value: 'rss',
    label: 'RSS',
    badgeClass: 'bg-yellow-500/15 text-yellow-400',
    usernameLabel: 'Feed URL',
    usernamePlaceholder: 'https://example.com/feed.xml',
    variables: '{streamer} = feed title · {title} = item title · {url} = item link',
    messagePlaceholder: 'e.g. New post from {streamer}: {title} — {url}',
  },
];

export default function RssFeedsPage() {
  return (
    <FeedAlertsPage
      title="RSS Feeds"
      description="Post a Discord notification whenever an RSS or podcast feed publishes a new item. Checks every 5 minutes. No API key required."
      icon={Rss}
      iconColor="text-yellow-400"
      platforms={PLATFORMS}
    />
  );
}
