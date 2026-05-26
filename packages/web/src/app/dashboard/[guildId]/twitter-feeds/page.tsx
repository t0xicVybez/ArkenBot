'use client';

import { AtSign } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

const PLATFORMS = [
  {
    value: 'twitter',
    label: 'X / Twitter',
    badgeClass: 'bg-gray-500/15 text-gray-300',
    usernameLabel: 'Username',
    usernamePlaceholder: 'e.g. @shroud or shroud',
    variables: '{streamer} = @handle · {title} = tweet text · {url} = tweet link',
  },
];

export default function TwitterFeedsPage() {
  return (
    <FeedAlertsPage
      title="X / Twitter Feeds"
      description="Post a Discord notification whenever a tracked account publishes a new tweet. Checks every 5 minutes."
      icon={AtSign}
      iconColor="text-gray-300"
      platforms={PLATFORMS}
      notice="X/Twitter alerts require a Bearer Token (TWITTER_BEARER_TOKEN) set in the bot's .env file. A free X Developer account with a Basic app is sufficient. Without it, Twitter alerts will be silently skipped."
    />
  );
}
