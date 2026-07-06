'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { slowmodeApi, guildsApi } from '@/lib/api';
import { Timer, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Toggle } from '@/components/Toggle';

type SlowmodeConfig = {
  id: string;
  channelId: string;
  threshold: number;
  window: number;
  slowmode: number;
  resetAfter: number;
  enabled: boolean;
};

export default function SlowmodePage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const [newChannelId, setNewChannelId] = useState('');
  const [newThreshold, setNewThreshold] = useState(10);
  const [newWindow, setNewWindow] = useState(10);
  const [newSlowmode, setNewSlowmode] = useState(5);
  const [newResetAfter, setNewResetAfter] = useState(30);

  const { data: slowmodeRes, isLoading } = useQuery({
    queryKey: ['slowmode', guildId],
    queryFn: () => slowmodeApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const configs: SlowmodeConfig[] = (slowmodeRes?.data as { data?: SlowmodeConfig[] })?.data ?? [];
  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => slowmodeApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Slowmode config deleted');
      queryClient.invalidateQueries({ queryKey: ['slowmode', guildId] });
    },
    onError: () => toast.error('Failed to delete slowmode config'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      slowmodeApi.update(guildId, id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slowmode', guildId] });
    },
    onError: () => toast.error('Failed to update slowmode config'),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => slowmodeApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Slowmode config created');
      queryClient.invalidateQueries({ queryKey: ['slowmode', guildId] });
      setNewChannelId('');
      setNewThreshold(10);
      setNewWindow(10);
      setNewSlowmode(5);
      setNewResetAfter(30);
    },
    onError: () => toast.error('Failed to create slowmode config'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelId) return toast.error('Please select a channel');
    createMutation.mutate({
      channelId: newChannelId,
      threshold: newThreshold,
      window: newWindow,
      slowmode: newSlowmode,
      resetAfter: newResetAfter,
    });
  };

  const getChannelName = (channelId: string) => {
    const ch = textChannels.find((c) => c.id === channelId);
    return ch ? `#${ch.name}` : channelId;
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Timer className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Auto-Slowmode</h1>
          <div className="page-head-desc">Automatically apply slowmode when channels get busy.</div>
        </div>
      </div>

      <div className="card mb-6 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-white">Slowmode Configs</h2>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Timer className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No auto-slowmode configs configured.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Threshold</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Window (s)</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Slowmode (s)</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Reset After (s)</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Enabled</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {configs.map((cfg) => (
                  <tr key={cfg.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-200">{getChannelName(cfg.channelId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{cfg.threshold} msgs</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{cfg.window}s</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{cfg.slowmode}s</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{cfg.resetAfter}s</td>
                    <td className="px-4 py-3">
                      <Toggle
                        enabled={cfg.enabled}
                        onChange={(v) => toggleMutation.mutate({ id: cfg.id, enabled: v })}
                        disabled={toggleMutation.isPending}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteMutation.mutate(cfg.id)}
                        disabled={deleteMutation.isPending}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete config"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Add Slowmode Config</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Channel</label>
            <select
              className="input"
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              required
            >
              <option value="">Select a text channel</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Threshold (messages)</label>
              <input
                type="number"
                className="input"
                value={newThreshold}
                min={1}
                onChange={(e) => setNewThreshold(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Messages per window to trigger slowmode</p>
            </div>
            <div>
              <label className="label">Window (seconds)</label>
              <input
                type="number"
                className="input"
                value={newWindow}
                min={1}
                onChange={(e) => setNewWindow(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Time window to count messages in</p>
            </div>
            <div>
              <label className="label">Slowmode Duration (seconds)</label>
              <input
                type="number"
                className="input"
                value={newSlowmode}
                min={1}
                max={21600}
                onChange={(e) => setNewSlowmode(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Slowmode delay to apply (1–21600s)</p>
            </div>
            <div>
              <label className="label">Reset After (seconds)</label>
              <input
                type="number"
                className="input"
                value={newResetAfter}
                min={1}
                onChange={(e) => setNewResetAfter(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Remove slowmode after inactivity</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? 'Adding...' : 'Add Config'}
          </button>
        </form>
      </div>
    </div>
  );
}
