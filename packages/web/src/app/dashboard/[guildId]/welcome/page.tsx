'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import type { WelcomeConfig } from '@arkenbot/shared';
import { MessageSquare } from 'lucide-react';

export default function WelcomePage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Partial<WelcomeConfig>>({});

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['welcome', guildId],
    queryFn: () => settingsApi.getWelcome(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    if (configRes?.data?.data) setConfig(configRes.data.data as Partial<WelcomeConfig>);
  }, [configRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<WelcomeConfig>) => settingsApi.updateWelcome(guildId, data),
    onSuccess: () => {
      toast.success('Welcome settings saved!');
      queryClient.invalidateQueries({ queryKey: ['welcome', guildId] });
    },
    onError: () => toast.error('Failed to save welcome settings.'),
  });

  const handleSave = (partial: Partial<WelcomeConfig>) => mutation.mutate(partial);

  const channels = (channelsRes?.data?.data ?? []) as Array<{ id: string; name: string; type: number }>;
  const textChannels = channels.filter((c) => c.type === 0);

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-discord-blurple" />
        <h1 className="text-2xl font-bold text-white">Welcome Messages</h1>
      </div>

      <SettingsSection title="Welcome" description="Send a message when a member joins the server.">
        <Toggle
          label="Enable Welcome Messages"
          description="Post a message in the welcome channel when someone joins"
          enabled={config.welcomeEnabled ?? false}
          onChange={(v) => { setConfig((c) => ({ ...c, welcomeEnabled: v })); handleSave({ welcomeEnabled: v }); }}
        />
        <div>
          <label className="label">Welcome Channel</label>
          <select
            className="input"
            value={config.welcomeChannelId ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, welcomeChannelId: e.target.value || undefined }))}
            onBlur={() => handleSave({ welcomeChannelId: config.welcomeChannelId })}
          >
            <option value="">Select a channel</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Welcome Message</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={config.welcomeMessage ?? ''}
            placeholder="Welcome {user} to {server}!"
            onChange={(e) => setConfig((c) => ({ ...c, welcomeMessage: e.target.value }))}
            onBlur={() => handleSave({ welcomeMessage: config.welcomeMessage })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Variables: {'{user}'}, {'{username}'}, {'{server}'}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Leave Messages" description="Send a message when a member leaves the server.">
        <Toggle
          label="Enable Leave Messages"
          description="Post a message when someone leaves or is kicked"
          enabled={config.leaveEnabled ?? false}
          onChange={(v) => { setConfig((c) => ({ ...c, leaveEnabled: v })); handleSave({ leaveEnabled: v }); }}
        />
        <div>
          <label className="label">Leave Channel</label>
          <select
            className="input"
            value={config.leaveChannelId ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, leaveChannelId: e.target.value || undefined }))}
            onBlur={() => handleSave({ leaveChannelId: config.leaveChannelId })}
          >
            <option value="">Same as welcome channel</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Leave Message</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={config.leaveMessage ?? ''}
            placeholder="Goodbye {username}, we hope to see you again!"
            onChange={(e) => setConfig((c) => ({ ...c, leaveMessage: e.target.value }))}
            onBlur={() => handleSave({ leaveMessage: config.leaveMessage })}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
