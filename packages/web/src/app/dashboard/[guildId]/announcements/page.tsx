'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementsApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Megaphone } from 'lucide-react';

interface AnnouncementSettings {
  announcementsEnabled: boolean;
  announcementChannelId: string | null;
}

export default function AnnouncementsSettingsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AnnouncementSettings>({
    announcementsEnabled: false,
    announcementChannelId: null,
  });

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['announcement-settings', guildId],
    queryFn: () => announcementsApi.getSettings(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    if (settingsRes?.data?.data) {
      setSettings(settingsRes.data.data as AnnouncementSettings);
    }
  }, [settingsRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<AnnouncementSettings>) => announcementsApi.updateSettings(guildId, data),
    onSuccess: () => {
      toast.success('Announcement settings saved!');
      queryClient.invalidateQueries({ queryKey: ['announcement-settings', guildId] });
    },
    onError: () => toast.error('Failed to save settings.'),
  });

  const channels = (channelsRes?.data?.data ?? []) as Array<{ id: string; name: string; type: number }>;
  const textChannels = channels.filter((c) => c.type === 0);

  const handleSave = (partial: Partial<AnnouncementSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    mutation.mutate(partial);
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-4">
          <div className="card h-32 bg-gray-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Megaphone className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Announcements</h1>
          <p className="text-gray-400 text-sm">Receive update announcements directly in your server</p>
        </div>
      </div>

      <SettingsSection
        title="Announcement Settings"
        description="When enabled, Arken Bot will post staff-crafted update announcements in your chosen channel. You can disable this at any time."
      >
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium text-sm">Enable announcements</p>
            <p className="text-gray-400 text-xs mt-0.5">Receive bot update posts in this server</p>
          </div>
          <button
            onClick={() => handleSave({ announcementsEnabled: !settings.announcementsEnabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.announcementsEnabled ? 'bg-discord-blurple' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.announcementsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Channel picker — only shown when enabled */}
        {settings.announcementsEnabled && (
          <div>
            <label className="label">Announcement Channel</label>
            <select
              className="input w-full"
              value={settings.announcementChannelId ?? ''}
              onChange={(e) => handleSave({ announcementChannelId: e.target.value || null })}
            >
              <option value="">Select a channel…</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
            {!settings.announcementChannelId && (
              <p className="text-yellow-400 text-xs mt-1">
                You must select a channel to receive announcements.
              </p>
            )}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
