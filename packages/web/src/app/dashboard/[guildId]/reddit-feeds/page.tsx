'use client';

import { Globe } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

const PLATFORMS = [
  {
    value: 'reddit',
    label: 'Reddit',
    badgeClass: 'bg-orange-500/15 text-orange-400',
    usernameLabel: 'Subreddit name',
    usernamePlaceholder: 'e.g. gaming  (no r/ prefix needed)',
    variables: '{streamer} = r/subreddit · {title} = post title · {author} = username · {url} = post link',
  },
];

export default function RedditFeedsPage() {
  return (
    <FeedAlertsPage
      title="Reddit Feeds"
      description="Post a Discord notification whenever a subreddit receives a new post. Checks every 5 minutes."
      icon={Globe}
      iconColor="text-orange-400"
      platforms={PLATFORMS}
    />
  );
}
