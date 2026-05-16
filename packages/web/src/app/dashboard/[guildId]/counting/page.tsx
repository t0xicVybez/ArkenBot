'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { countingApi, addonsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { Hash, RotateCcw, Trophy } from 'lucide-react';

export default function CountingPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: ['counting', guildId],
    queryFn:  () => countingApi.get(guildId),
  });

  const resetMutation = useMutation({
    mutationFn: () => countingApi.reset(guildId),
    onSuccess: () => {
      toast.success('Count reset to 0.');
      queryClient.invalidateQueries({ queryKey: ['counting', guildId] });
    },
    onError: () => toast.error('Failed to reset count.'),
  });

  const data = res?.data?.data as {
    installed: boolean;
    enabled: boolean;
    settings: { channelId?: string; allowSameUser?: boolean; resetOnFail?: boolean };
    currentCount: number;
    bestCount: number;
    lastUserId: string | null;
  } | undefined;

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(2)].map((_, i) => <div key={i} className="card h-32 bg-gray-700" />)}
        </div>
      </div>
    );
  }

  if (!data?.installed) {
    return (
      <div className="p-3 sm:p-6 max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Hash className="w-6 h-6 text-discord-blurple" />
          <h1 className="text-2xl font-bold text-white">Counting</h1>
        </div>
        <div className="card text-center py-12">
          <Hash className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">The Counting addon is not installed.</p>
          <p className="text-gray-500 text-sm">
            Go to <span className="text-discord-blurple">Addon Manager</span> to install it, then configure the counting channel here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Hash className="w-6 h-6 text-discord-blurple" />
        <h1 className="text-2xl font-bold text-white">Counting</h1>
      </div>

      <SettingsSection title="Live Stats" description="Current state of the counting game in this server.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Current Count</p>
            <p className="text-white text-3xl font-bold">{data.currentCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-center">
            <p className="text-gray-400 text-xs mb-1 flex items-center justify-center gap-1"><Trophy className="w-3 h-3" /> Best Count</p>
            <p className="text-yellow-400 text-3xl font-bold">{data.bestCount.toLocaleString()}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Configuration" description="Settings are managed via the Addon Manager. Use the Reset button to restart the count.">
        <div className="space-y-2 text-sm text-gray-400">
          {data.settings.channelId && (
            <p>Counting channel: <span className="text-white font-mono">#{data.settings.channelId}</span></p>
          )}
          <p>Allow same user twice in a row: <span className="text-white">{data.settings.allowSameUser ? 'Yes' : 'No'}</span></p>
          <p>Reset count on fail: <span className="text-white">{data.settings.resetOnFail !== false ? 'Yes' : 'No'}</span></p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="btn-danger flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            {resetMutation.isPending ? 'Resetting…' : 'Reset Count to 0'}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
