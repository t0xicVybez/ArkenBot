'use client';

import { AtSign } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

const PLATFORMS = [
  {
    value: 'twitter',
    label: 'X / Twitter',
    badgeClass: 'bg-gray-500/15 text-gray-300',
    usernameLabel: 'Username',
    usernamePlaceholder: 'e.g. @shroud',
    variables: '{streamer}, {title}, {url}',
  },
];

export default function TwitterFeedsPage() {
  return (
    <FeedAlertsPage
      title="X / Twitter Feeds"
      description="Post a Discord notification whenever a tracked account publishes a new tweet."
      icon={AtSign}
      iconColor="text-gray-300"
      platforms={PLATFORMS}
      notice="X (Twitter) alerts require a Bearer Token configured on the server. Contact your bot administrator if posts are not appearing."
    />
  );
}
