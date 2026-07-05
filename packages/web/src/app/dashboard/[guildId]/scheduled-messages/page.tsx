'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduledMessagesApi, guildsApi } from '@/lib/api';
import { Clock, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Toggle } from '@/components/Toggle';

type ScheduledMessage = {
  id: string;
  channelId: string;
  content: string;
  scheduledAt: string;
  repeat: 'none' | 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
  roleMentionId?: string | null;
  failureCount?: number;
  lastError?: string | null;
};

const REPEAT_OPTIONS = [
  { value: 'none', label: 'No repeat' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export default function ScheduledMessagesPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const [newChannelId, setNewChannelId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [newRepeat, setNewRepeat] = useState<'none' | 'hourly' | 'daily' | 'weekly'>('none');
  const [newRoleMentionId, setNewRoleMentionId] = useState('');

  const { data: msgsRes, isLoading } = useQuery({
    queryKey: ['scheduled-messages', guildId],
    queryFn: () => scheduledMessagesApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const messages: ScheduledMessage[] = (msgsRes?.data as { data?: ScheduledMessage[] })?.data ?? [];
  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const roles = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduledMessagesApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Scheduled message deleted');
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
    },
    onError: () => toast.error('Failed to delete scheduled message'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      scheduledMessagesApi.update(guildId, id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
    },
    onError: () => toast.error('Failed to update scheduled message'),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => scheduledMessagesApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Scheduled message created');
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
      setNewChannelId('');
      setNewContent('');
      setNewScheduledAt('');
      setNewRepeat('none');
      setNewRoleMentionId('');
    },
    onError: () => toast.error('Failed to create scheduled message'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelId) return toast.error('Please select a channel');
    if (!newContent.trim()) return toast.error('Please enter a message');
    if (!newScheduledAt) return toast.error('Please select a date and time');
    createMutation.mutate({
      channelId: newChannelId,
      content: newContent,
      scheduledAt: new Date(newScheduledAt).toISOString(),
      repeat: newRepeat,
      ...(newRoleMentionId ? { roleMentionId: newRoleMentionId } : {}),
    });
  };

  const getChannelName = (channelId: string) => {
    const ch = textChannels.find((c) => c.id === channelId);
    return ch ? `#${ch.name}` : channelId;
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Clock className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">Scheduled Messages</h1>
          <p className="text-sm text-gray-400">Automatically send messages at specified times.</p>
        </div>
      </div>

      <div className="card mb-6 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50">
          <h2 className="text-lg font-semibold text-white">Scheduled Messages</h2>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No scheduled messages yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-discord-darkest-bg">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Channel</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Content</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Scheduled</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Repeat</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Enabled</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {messages.map((msg) => (
                <tr key={msg.id} className="hover:bg-discord-dark-bg/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-200">{getChannelName(msg.channelId)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">
                    {msg.content.length > 50 ? `${msg.content.slice(0, 50)}…` : msg.content}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                    {new Date(msg.scheduledAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 capitalize">{msg.repeat}</td>
                  <td className="px-4 py-3">
                    <Toggle
                      enabled={msg.enabled}
                      onChange={(v) => toggleMutation.mutate({ id: msg.id, enabled: v })}
                      disabled={toggleMutation.isPending}
                    />
                    {!msg.enabled && msg.lastError && (
                      <p className="text-[11px] text-red-400/90 mt-1 max-w-[200px]" title={msg.lastError}>
                        Auto-disabled: {msg.lastError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteMutation.mutate(msg.id)}
                      disabled={deleteMutation.isPending}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="Delete scheduled message"
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
        <h2 className="text-lg font-semibold text-white mb-4">Create Scheduled Message</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Channel</label>
            <select
              className="input"
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              required
            >
              <option value="">Select a channel</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Message Content</label>
            <textarea
              className="input min-h-[100px] resize-y"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter your message here..."
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Schedule Date & Time</label>
              <input
                type="datetime-local"
                className="input"
                value={newScheduledAt}
                onChange={(e) => setNewScheduledAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Repeat</label>
              <select
                className="input"
                value={newRepeat}
                onChange={(e) => setNewRepeat(e.target.value as typeof newRepeat)}
              >
                {REPEAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Ping Role (optional)</label>
            <select
              className="input"
              value={newRoleMentionId}
              onChange={(e) => setNewRoleMentionId(e.target.value)}
            >
              <option value="">No role ping</option>
              {roles.filter((r) => r.name !== '@everyone').map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">The selected role will be mentioned when this message is sent.</p>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? 'Scheduling...' : 'Schedule Message'}
          </button>
        </form>
      </div>
    </div>
  );
}
