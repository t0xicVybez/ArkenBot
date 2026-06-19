'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tempVoiceApi, guildsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { SettingsSection } from '@/components/SettingsSection';

export default function TempVoicePage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [triggerChannelId, setTriggerChannelId] = useState<string>('');

  const { data: configRes } = useQuery({
    queryKey: ['temp-voice-config', guildId],
    queryFn: () => tempVoiceApi.getConfig(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    const cfg = (configRes?.data as { data?: { joinToCreateChannelId?: string | null } })?.data;
    if (cfg) setTriggerChannelId(cfg.joinToCreateChannelId ?? '');
  }, [configRes]);

  const saveMutation = useMutation({
    mutationFn: (channelId: string | null) => tempVoiceApi.setTriggerChannel(guildId, channelId),
    onSuccess: () => {
      toast.success('Temp voice config saved!');
      queryClient.invalidateQueries({ queryKey: ['temp-voice-config', guildId] });
    },
    onError: () => toast.error('Failed to save config'),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const voiceChannels = allChannels.filter((c) => c.type === 2);

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Mic className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">Temporary Voice Channels</h1>
          <p className="text-sm text-gray-400">Create-to-Join: members get their own VC automatically.</p>
        </div>
      </div>

      <SettingsSection
        title="Join-to-Create Channel"
        description="When a member joins this voice channel, a new private channel is created for them. The channel is automatically deleted when it becomes empty."
      >
        <div className="space-y-4">
          <div>
            <label className="label">Trigger Voice Channel</label>
            <select
              className="input"
              value={triggerChannelId}
              onChange={(e) => setTriggerChannelId(e.target.value)}
            >
              <option value="">Disabled — no trigger channel</option>
              {voiceChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>🔊 {ch.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Create a voice channel named something like &quot;➕ Join to Create&quot; and select it here.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => saveMutation.mutate(triggerChannelId || null)}
              disabled={saveMutation.isPending}
              className="btn-primary"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            {triggerChannelId && (
              <button
                onClick={() => { setTriggerChannelId(''); saveMutation.mutate(null); }}
                disabled={saveMutation.isPending}
                className="btn-secondary"
              >
                Disable
              </button>
            )}
          </div>
        </div>
      </SettingsSection>

      <div className="card mt-4 bg-discord-blurple/5 border border-discord-blurple/20">
        <h3 className="text-sm font-semibold text-discord-blurple mb-2">How it works</h3>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>Select a voice channel as the trigger (e.g. &quot;➕ Join to Create&quot;)</li>
          <li>When a member joins the trigger channel, the bot creates a new VC named after them</li>
          <li>The member is moved to their new private channel automatically</li>
          <li>The channel is deleted when it becomes empty</li>
          <li>The channel owner can rename or manage it via Discord</li>
        </ul>
      </div>
    </div>
  );
}
