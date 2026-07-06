'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import type { GuildSettings } from '@arkenbot/shared';
import { Music } from 'lucide-react';

export default function MusicPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<GuildSettings>>({});

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
  });

  useEffect(() => {
    if (settingsRes?.data?.data) setSettings(settingsRes.data.data);
  }, [settingsRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<GuildSettings>) => settingsApi.update(guildId, data),
    onSuccess: () => {
      toast.success('Music settings saved!');
      queryClient.invalidateQueries({ queryKey: ['settings', guildId] });
    },
    onError: () => toast.error('Failed to save music settings.'),
  });

  const handleSave = (partial: Partial<GuildSettings>) => mutation.mutate(partial);

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Music className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Music</h1>
          <div className="page-head-desc">High-quality playback with a persistent queue.</div>
        </div>
      </div>

      <SettingsSection title="Music Player" description="Control music playback settings for this server.">
        <Toggle
          label="Enable Music"
          description="Allow the bot to play music in voice channels via /play, /skip, /queue, etc."
          enabled={settings.musicEnabled ?? true}
          onChange={(v) => { setSettings((s) => ({ ...s, musicEnabled: v })); handleSave({ musicEnabled: v }); }}
        />
      </SettingsSection>

      <SettingsSection title="How to use" description="Music is controlled via Discord slash commands.">
        <div className="space-y-2 text-sm text-gray-400">
          {[
            ['/play <url or search>', 'Play a song from YouTube, Spotify, or SoundCloud'],
            ['/skip', 'Skip the current song'],
            ['/queue', 'View the current queue'],
            ['/pause / /resume', 'Pause or resume playback'],
            ['/volume <1-100>', 'Adjust the volume'],
            ['/stop', 'Stop playback and clear the queue'],
            ['/nowplaying', 'Show the currently playing track'],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-3">
              <code className="text-discord-blurple font-mono w-52 flex-shrink-0">{cmd}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
