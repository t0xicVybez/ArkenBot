'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import { streamAlertsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, Fragment, type ComponentType } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';

export interface PlatformConfig {
  value: string;
  label: string;
  badgeClass: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  variables: string;
}

interface FeedAlertsPageProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  iconColor: string;
  platforms: PlatformConfig[];
  notice?: string;
}

type StreamAlert = {
  id: string;
  platform: string;
  channelUsername: string;
  discordChannelId: string;
  message?: string | null;
  enabled: boolean;
};

export function FeedAlertsPage({ title, description, icon: Icon, iconColor, platforms, notice }: FeedAlertsPageProps) {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const platformValues = platforms.map((p) => p.value);
  const defaultPlatform = platforms[0].value;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: defaultPlatform, username: '', discordChannelId: '', message: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: '', message: '' });

  const queryKey = ['stream-alerts', guildId, ...platformValues];

  const { data: res, isLoading } = useQuery({
    queryKey,
    queryFn: () => streamAlertsApi.list(guildId, platformValues),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const alerts: StreamAlert[] = (res?.data as { data?: StreamAlert[] })?.data ?? [];

  const platformMap = Object.fromEntries(platforms.map((p) => [p.value, p]));
  const currentPlatformConfig = platformMap[form.platform] ?? platforms[0];

  const createMutation = useMutation({
    mutationFn: (data: object) => streamAlertsApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Feed alert created!');
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
      setForm({ platform: defaultPlatform, username: '', discordChannelId: '', message: '' });
    },
    onError: () => toast.error('Failed to create feed alert'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      streamAlertsApi.update(guildId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error('Failed to update alert'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      streamAlertsApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success('Alert updated!');
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update alert'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => streamAlertsApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Alert deleted');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error('Failed to delete alert'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.discordChannelId) return toast.error('Discord channel is required');
    if (!form.username.trim()) return toast.error('Source / URL is required');
    createMutation.mutate({
      platform: form.platform,
      channelUsername: form.username.trim(),
      discordChannelId: form.discordChannelId,
      message: form.message.trim() || undefined,
    });
  };

  const handleEditOpen = (alert: StreamAlert) => {
    setEditingId(alert.id);
    setEditForm({ username: alert.channelUsername, message: alert.message ?? '' });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editForm.username.trim()) return;
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
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`w-6 h-6 ${iconColor}`} />
          <div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Alert
        </button>
      </div>

      {notice && (
        <div className="card border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm text-yellow-300">{notice}</p>
        </div>
      )}

      {showForm && (
        <SettingsSection title="New Alert" description="Post a notification in Discord whenever this feed has new activity.">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {platforms.length > 1 && (
                <div>
                  <label className="label">Platform</label>
                  <select
                    className="input"
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value, username: '' }))}
                  >
                    {platforms.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">{currentPlatformConfig.usernameLabel}</label>
                <input
                  type="text"
                  className="input"
                  placeholder={currentPlatformConfig.usernamePlaceholder}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
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
            </div>
            <div>
              <label className="label">Custom Message <span className="text-gray-500 font-normal">(optional)</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. New post from {streamer}: {url}"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Variables: {currentPlatformConfig.variables}</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? 'Creating…' : 'Create Alert'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </SettingsSection>
      )}

      {alerts.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">No alerts configured yet. Click <strong className="text-gray-300">Add Alert</strong> to get started.</p>
      )}

      {alerts.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-700/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-discord-darkest-bg">
                <tr>
                  {platforms.length > 1 && <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Platform</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Enabled</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {alerts.map((alert) => {
                  const ch = textChannels.find((c) => c.id === alert.discordChannelId);
                  const pc = platformMap[alert.platform];
                  return (
                    <Fragment key={alert.id}>
                      <tr className="hover:bg-discord-dark-bg/30 transition-colors">
                        {platforms.length > 1 && (
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pc?.badgeClass ?? 'bg-gray-700 text-gray-300'}`}>
                              {pc?.label ?? alert.platform}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm font-mono text-gray-200">{alert.channelUsername}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {ch ? `#${ch.name}` : <span className="text-gray-600 text-xs">{alert.discordChannelId}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Toggle
                            enabled={alert.enabled}
                            onChange={(v) => toggleMutation.mutate({ id: alert.id, enabled: v })}
                            disabled={toggleMutation.isPending}
                          />
                        </td>
                        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                          <button onClick={() => handleEditOpen(alert)} className="text-gray-400 hover:text-white transition-colors p-1" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMutation.mutate(alert.id)} disabled={deleteMutation.isPending} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {editingId === alert.id && (
                        <tr className="bg-discord-darkest-bg">
                          <td colSpan={platforms.length > 1 ? 5 : 4} className="px-4 py-4">
                            <form onSubmit={handleUpdate} className="space-y-3">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-semibold text-white">Edit Alert</p>
                                <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="label">Source / URL</label>
                                  <input type="text" className="input" value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Custom Message</label>
                                  <input type="text" className="input" value={editForm.message} onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))} />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button type="submit" disabled={editMutation.isPending} className="btn-primary">{editMutation.isPending ? 'Saving…' : 'Save'}</button>
                                <button type="button" onClick={() => setEditingId(null)} className="btn-secondary">Cancel</button>
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
  );
}
