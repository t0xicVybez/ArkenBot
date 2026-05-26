'use client';

import { Globe } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

const PLATFORMS = [
  {
    value: 'reddit',
    label: 'Reddit',
    badgeClass: 'bg-orange-500/15 text-orange-400',
    usernameLabel: 'Subreddit',
    usernamePlaceholder: 'e.g. gaming (no r/ prefix)',
    variables: '{streamer}, {title}, {url}, {author}',
  },
];

export default function RedditFeedsPage() {
  return (
    <FeedAlertsPage
      title="Reddit Feeds"
      description="Post a Discord notification whenever a subreddit receives a new post."
      icon={Globe}
      iconColor="text-orange-400"
      platforms={PLATFORMS}
    />
  );
}
