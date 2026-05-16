'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Trash2, Plus } from 'lucide-react';
import { guildsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, Fragment } from 'react';
import api from '@/lib/api';

type StreamAlert = {
  id: string;
  platform: 'twitch' | 'kick' | 'twitter' | 'reddit' | 'rss';
  channelUsername: string;
  channelId?: string | null;
  discordChannelId: string;
  message?: string;
  enabled: boolean;
};

const streamAlertsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/stream-alerts`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/stream-alerts`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/stream-alerts/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/stream-alerts/${id}`),
};

const PLATFORM_LABELS: Record<string, string> = {
  twitch: 'Twitch', kick: 'Kick',
  twitter: 'X (Twitter)', reddit: 'Reddit', rss: 'RSS / Podcast',
};
const PLATFORM_COLORS: Record<string, string> = {
  twitch:  'bg-purple-500/15 text-purple-300',
  kick:    'bg-green-500/15 text-green-400',
  twitter: 'bg-gray-500/15 text-gray-300',
  reddit:  'bg-orange-500/15 text-orange-400',
  rss:     'bg-yellow-500/15 text-yellow-400',
};
const PLATFORM_USERNAME_LABEL: Record<string, string> = {
  twitch: 'Channel Username',
  kick: 'Channel Username', twitter: 'Username (e.g. @shroud)',
  reddit: 'Subreddit (e.g. gaming)', rss: 'Feed URL',
};
const PLATFORM_USERNAME_PLACEHOLDER: Record<string, string> = {
  twitch: 'e.g. shroud',
  kick: 'e.g. shroud', twitter: 'e.g. @shroud',
  reddit: 'e.g. gaming', rss: 'https://example.com/feed.xml',
};
const PLATFORM_VARIABLES: Record<string, string> = {
  twitch:  '{streamer}, {title}, {url}, {game}',
  kick:    '{streamer}, {title}, {url}',
  twitter: '{streamer}, {title}, {url}',
  reddit:  '{streamer}, {title}, {url}, {author}',
  rss:     '{streamer}, {title}, {url}',
};

export default function StreamAlertsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: 'twitch', username: '', discordChannelId: '', message: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: '', message: '' });

  const { data: res, isLoading } = useQuery({
    queryKey: ['stream-alerts', guildId],
    queryFn: () => streamAlertsApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const alerts: StreamAlert[] = (res?.data as { data?: StreamAlert[] })?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: object) => streamAlertsApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Stream alert created!');
      queryClient.invalidateQueries({ queryKey: ['stream-alerts', guildId] });
      setShowForm(false);
      setForm({ platform: 'twitch', username: '', discordChannelId: '', message: '' });
    },
    onError: () => toast.error('Failed to create stream alert'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      streamAlertsApi.update(guildId, id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-alerts', guildId] });
    },
    onError: () => toast.error('Failed to update alert'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      streamAlertsApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success('Stream alert updated!');
      queryClient.invalidateQueries({ queryKey: ['stream-alerts', guildId] });
      setEditingId(null);
      setEditForm({ username: '', message: '' });
    },
    onError: () => toast.error('Failed to update alert'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => streamAlertsApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Alert deleted');
      queryClient.invalidateQueries({ queryKey: ['stream-alerts', guildId] });
    },
    onError: () => toast.error('Failed to delete alert'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.discordChannelId) {
      toast.error('Discord channel is required');
      return;
    }
    if (!form.username.trim()) {
      toast.error('Username / URL is required');
      return;
    }
    createMutation.mutate({
      platform: form.platform,
      channelUsername: form.username.trim(),
      discordChannelId: form.discordChannelId,
      message: form.message.trim() || undefined,
    });
  };

  const handleEdit = (alert: StreamAlert) => {
    setEditingId(alert.id);
    setEditForm({
      username: alert.channelUsername,
      message: alert.message ?? '',
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.username.trim()) {
      toast.error('Username is required');
      return;
    }
    editMutation.mutate({
      id: editingId,
      payload: {
        channelUsername: editForm.username.trim(),
        message: editForm.message.trim() || undefined,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-4xl space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card h-28 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Radio className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">Stream Alerts</h1>
          <p className="text-sm text-gray-400">Get notified in Discord when a creator goes live, posts a tweet, a subreddit gets a new post, or an RSS feed updates.</p>
        </div>
      </div>

      <div className="card mb-6 border border-yellow-500/20 bg-yellow-500/5">
        <p className="text-sm text-yellow-300">
          Twitch live checks require API credentials on the server (Twitch client ID and secret).
          Kick, Reddit, and RSS/Podcast need no platform keys.
          X (Twitter) requires a Bearer Token. Contact your bot administrator if alerts are not firing.
        </p>
      </div>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Stream Alerts</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Alert
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 p-4 rounded-lg bg-discord-darkest-bg border border-gray-700/50 space-y-3">
            <h3 className="text-sm font-semibold text-white">New Stream Alert</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Platform</label>
                <select
                  className="input"
                  value={form.platform}
                  onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                >
                  <option value="twitch">Twitch</option>
                  <option value="kick">Kick</option>
                  <option value="twitter">X (Twitter)</option>
                  <option value="reddit">Reddit</option>
                  <option value="rss">RSS / Podcast</option>
                </select>
              </div>
              <div>
                <label className="label">{PLATFORM_USERNAME_LABEL[form.platform] ?? 'Username / URL'}</label>
                <input
                  type="text"
                  className="input"
                  placeholder={PLATFORM_USERNAME_PLACEHOLDER[form.platform] ?? ''}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label">Discord Channel</label>
              <select
                className="input"
                value={form.discordChannelId}
                onChange={(e) => setForm((f) => ({ ...f, discordChannelId: e.target.value }))}
              >
                <option value="">Select a channel</option>
                {textChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Custom Message (optional)</label>
              <input
                type="text"
                className="input"
                placeholder={`@everyone {streamer} is live! {url}`}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Variables: {PLATFORM_VARIABLES[form.platform] ?? '{streamer}, {title}, {url}'}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-1.5 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Alert'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {alerts.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            No stream alerts configured yet. Click &quot;Add Alert&quot; to create one.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-700/50">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-discord-darkest-bg">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Platform</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Channel / URL</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Discord Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Enabled</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {alerts.map((alert) => {
                  const channel = textChannels.find((c) => c.id === alert.discordChannelId);
                  return (
                    <Fragment key={alert.id}>
                      <tr className="hover:bg-discord-dark-bg/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLATFORM_COLORS[alert.platform] ?? 'bg-gray-700 text-gray-300'}`}>
                            {PLATFORM_LABELS[alert.platform] ?? alert.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-200">{alert.channelUsername}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {channel ? `#${channel.name}` : <span className="text-gray-600 text-xs font-mono">{alert.discordChannelId}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Toggle
                            enabled={alert.enabled}
                            onChange={(v) => toggleMutation.mutate({ id: alert.id, enabled: v })}
                            disabled={toggleMutation.isPending}
                          />
                        </td>
                        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(alert)}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Edit alert"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(alert.id)}
                            disabled={deleteMutation.isPending}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            title="Delete alert"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {editingId === alert.id && (
                        <tr className="bg-discord-darkest-bg">
                          <td colSpan={5} className="px-4 py-4">
                            <form onSubmit={handleUpdate} className="space-y-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="label">Username / URL</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={editForm.username}
                                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                                  />
                                </div>
                                <div>
                                  <label className="label">Custom Message</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={editForm.message}
                                    onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))}
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  disabled={editMutation.isPending}
                                  className="px-4 py-1.5 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                  {editMutation.isPending ? 'Saving…' : 'Save Changes'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
