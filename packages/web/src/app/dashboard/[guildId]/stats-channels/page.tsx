'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { statsChannelsApi, guildsApi } from '@/lib/api';
import { BarChart2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';

type StatsChannel = {
  id: string;
  channelId: string;
  type: string;
  format: string;
};

const STAT_TYPES = [
  { value: 'members', label: 'Total Members', defaultFormat: 'Members: {value}' },
  { value: 'online', label: 'Online Members', defaultFormat: 'Online: {value}' },
  { value: 'boosts', label: 'Server Boosts', defaultFormat: 'Boosts: {value}' },
  { value: 'bots', label: 'Bots', defaultFormat: 'Bots: {value}' },
];

export default function StatsChannelsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const [newChannelId, setNewChannelId] = useState('');
  const [newType, setNewType] = useState('members');
  const [newFormat, setNewFormat] = useState('Members: {value}');

  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ['stats-channels', guildId],
    queryFn: () => statsChannelsApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const statsChannels: StatsChannel[] = (statsRes?.data as { data?: StatsChannel[] })?.data ?? [];
  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const voiceChannels = allChannels.filter((c) => c.type === 2);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => statsChannelsApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Stats channel removed');
      queryClient.invalidateQueries({ queryKey: ['stats-channels', guildId] });
    },
    onError: () => toast.error('Failed to remove stats channel'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { channelId: string; type: string; format?: string }) =>
      statsChannelsApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Stats channel created');
      queryClient.invalidateQueries({ queryKey: ['stats-channels', guildId] });
      setNewChannelId('');
      setNewType('members');
      setNewFormat('Members: {value}');
    },
    onError: () => toast.error('Failed to create stats channel'),
  });

  const handleTypeChange = (type: string) => {
    setNewType(type);
    const preset = STAT_TYPES.find((t) => t.value === type);
    if (preset) setNewFormat(preset.defaultFormat);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelId) return toast.error('Please select a channel');
    createMutation.mutate({ channelId: newChannelId, type: newType, format: newFormat });
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><BarChart2 className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Stats Channels</h1>
          <div className="page-head-desc">Display live server statistics in voice channel names.</div>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Active Stats Channels</h2>
        {statsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : statsChannels.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No stats channels configured yet.</p>
        ) : (
          <div className="space-y-2">
            {statsChannels.map((sc) => {
              const ch = voiceChannels.find((c) => c.id === sc.channelId);
              return (
                <div
                  key={sc.id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">
                      {ch ? `🔊 ${ch.name}` : sc.channelId}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="badge badge-success text-xs">{sc.type}</span>
                      <span className="text-xs text-gray-500 truncate">{sc.format}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(sc.id)}
                    disabled={deleteMutation.isPending}
                    className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 ml-3"
                    title="Remove stats channel"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Add Stats Channel</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Voice Channel</label>
            <select
              className="input"
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              required
            >
              <option value="">Select a voice channel</option>
              {voiceChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  🔊 {ch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Stat Type</label>
            <select
              className="input"
              value={newType}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              {STAT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Format</label>
            <input
              type="text"
              className="input"
              value={newFormat}
              onChange={(e) => setNewFormat(e.target.value)}
              placeholder="Members: {value}"
            />
            <p className="text-xs text-gray-500 mt-1">Use {'{value}'} as a placeholder for the value.</p>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? 'Adding...' : 'Add Stats Channel'}
          </button>
        </form>
      </div>
    </div>
  );
}
