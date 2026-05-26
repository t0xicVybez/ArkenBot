'use client';

import { Radio } from 'lucide-react';
import { FeedAlertsPage } from '@/components/FeedAlertsPage';

const PLATFORMS = [
  {
    value: 'twitch',
    label: 'Twitch',
    badgeClass: 'bg-purple-500/15 text-purple-300',
    usernameLabel: 'Channel Username',
    usernamePlaceholder: 'e.g. shroud',
    variables: '{streamer}, {title}, {url}, {game}',
  },
  {
    value: 'kick',
    label: 'Kick',
    badgeClass: 'bg-green-500/15 text-green-400',
    usernameLabel: 'Channel Username',
    usernamePlaceholder: 'e.g. shroud',
    variables: '{streamer}, {title}, {url}',
  },
];

export default function StreamAlertsPage() {
  return (
    <FeedAlertsPage
      title="Stream Alerts"
      description="Get notified in Discord the moment a streamer goes live on Twitch or Kick."
      icon={Radio}
      iconColor="text-purple-400"
      platforms={PLATFORMS}
      notice="Twitch alerts require a Twitch Client ID and Secret configured on the server. Kick needs no platform credentials. Contact your bot administrator if alerts are not firing."
    />
  );
}
