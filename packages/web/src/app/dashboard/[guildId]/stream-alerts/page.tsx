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
    variables: '{streamer} = channel name · {title} = stream title · {game} = game name · {url} = channel URL',
    messagePlaceholder: 'e.g. @everyone {streamer} is live! Playing {game} — {url}',
  },
  {
    value: 'kick',
    label: 'Kick',
    badgeClass: 'bg-green-500/15 text-green-400',
    usernameLabel: 'Channel Username',
    usernamePlaceholder: 'e.g. shroud',
    variables: '{streamer} = channel name · {title} = stream title · {url} = channel URL',
    messagePlaceholder: 'e.g. @everyone {streamer} is live on Kick! {url}',
  },
  {
    value: 'youtube',
    label: 'YouTube',
    badgeClass: 'bg-red-500/15 text-red-400',
    usernameLabel: 'Channel Handle',
    usernamePlaceholder: 'e.g. @MrBeast',
    variables: '{streamer} = channel name · {title} = stream title · {url} = stream URL · (note: {game} is not supported on YouTube)',
    messagePlaceholder: 'e.g. @everyone {streamer} is live on YouTube! {url}',
  },
];

export default function StreamAlertsPage() {
  return (
    <FeedAlertsPage
      title="Stream Alerts"
      description="Notify the community when creators go live or post — Twitch, Kick, YouTube, X, RSS."
      icon={Radio}
      iconColor="text-purple-400"
      platforms={PLATFORMS}
    />
  );
}
