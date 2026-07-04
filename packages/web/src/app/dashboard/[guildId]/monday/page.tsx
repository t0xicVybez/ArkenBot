'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi, mondayApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, Fragment } from 'react';
import { Plus, Trash2, Pencil, X, Copy, Check } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.arkenbot.app';

const ALL_EVENTS = [
  { value: 'create_item',         label: 'Item Created' },
  { value: 'delete_item',         label: 'Item Deleted' },
  { value: 'update_name',         label: 'Item Renamed' },
  { value: 'change_column_value', label: 'Column Updated' },
  { value: 'create_subitem',      label: 'Subitem Created' },
  { value: 'move_item_to_group',  label: 'Item Moved' },
  { value: 'create_update',       label: 'Comment Added' },
  { value: 'archive_item',        label: 'Item Archived' },
  { value: 'restore_item',        label: 'Item Restored' },
  { value: 'create_group',        label: 'Group Created' },
  { value: 'delete_group',        label: 'Group Deleted' },
  { value: 'duplicate_item',      label: 'Item Duplicated' },
];

type MondayAlert = {
  id: string;
  discordChannelId: string;
  webhookToken: string;
  boardName: string | null;
  events: string[];
  hasApiToken: boolean;
  enabled: boolean;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
      title="Copy webhook URL"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function MondayPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const queryKey = ['monday-alerts', guildId];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ discordChannelId: '', boardName: '', mondayApiToken: '', events: [] as string[] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ boardName: '', mondayApiToken: '', events: [] as string[] });

  const { data: res, isLoading } = useQuery({
    queryKey,
    queryFn: () => mondayApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const alerts: MondayAlert[] = (res?.data as { data?: MondayAlert[] })?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: object) => mondayApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Monday.com alert created!');
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
      setForm({ discordChannelId: '', boardName: '', mondayApiToken: '', events: [] });
    },
    onError: () => toast.error('Failed to create alert'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      mondayApi.update(guildId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error('Failed to update alert'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      mondayApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success('Alert updated!');
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update alert'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mondayApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Alert deleted');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error('Failed to delete alert'),
  });

  const toggleEvent = (list: string[], value: string) =>
    list.includes(value) ? list.filter((e) => e !== value) : [...list, value];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.discordChannelId) return toast.error('Discord channel is required');
    createMutation.mutate({
      discordChannelId: form.discordChannelId,
      boardName: form.boardName.trim() || undefined,
      mondayApiToken: form.mondayApiToken.trim() || undefined,
      events: form.events,
    });
  };

  const handleEditOpen = (alert: MondayAlert) => {
    setEditingId(alert.id);
    setEditForm({ boardName: alert.boardName ?? '', mondayApiToken: '', events: alert.events });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    editMutation.mutate({
      id: editingId,
      payload: {
        boardName: editForm.boardName.trim() || null,
        events: editForm.events,
        ...(editForm.mondayApiToken.trim() ? { mondayApiToken: editForm.mondayApiToken.trim() } : {}),
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="4.5" cy="12" r="3.5" fill="#ff3d57"/>
            <circle cx="12" cy="12" r="3.5" fill="#ffcb00"/>
            <circle cx="19.5" cy="12" r="3.5" fill="#00ca72"/>
          </svg>
          <div>
            <h1 className="text-2xl font-bold text-white">monday.com Alerts</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Post detailed Discord notifications when monday.com board events occur
            </p>
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

      {/* How it works */}
      <div className="card border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-300">How to connect monday.com</p>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>Create an alert below and copy the generated Webhook URL.</li>
          <li>In monday.com, open your board → <strong className="text-gray-300">Integrate</strong> → search for <strong className="text-gray-300">Webhooks</strong>.</li>
          <li>Paste the Webhook URL and choose which events to send.</li>
          <li>Monday.com will send a challenge ping — ArkenBot responds automatically.</li>
        </ol>
      </div>

      {/* Create form */}
      {showForm && (
        <SettingsSection title="New monday.com Alert" description="Each alert generates a unique Webhook URL to paste into monday.com.">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Board Name <span className="text-gray-500 font-normal">(optional label)</span></label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Marketing Tasks"
                  value={form.boardName}
                  onChange={(e) => setForm((f) => ({ ...f, boardName: e.target.value }))}
                />
                <p className="text-xs text-gray-500 mt-1">Shown in the Discord embed footer for easy identification.</p>
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
              <label className="label">
                Monday.com API Token <span className="text-gray-500 font-normal">(optional — enables display names)</span>
              </label>
              <input
                type="password"
                className="input"
                placeholder="eyJhbGciOiJIUzI1NiJ9…"
                value={form.mondayApiToken}
                onChange={(e) => setForm((f) => ({ ...f, mondayApiToken: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in monday.com → Profile → <strong className="text-gray-400">Admin → API</strong>. Used only to resolve user display names in embeds.
              </p>
            </div>

            <div>
              <label className="label">Event Filter <span className="text-gray-500 font-normal">(leave all unchecked to receive every event)</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {ALL_EVENTS.map((ev) => (
                  <label key={ev.value} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-discord-blurple"
                      checked={form.events.includes(ev.value)}
                      onChange={() => setForm((f) => ({ ...f, events: toggleEvent(f.events, ev.value) }))}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
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

      {/* Empty state */}
      {alerts.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">
          No monday.com alerts configured yet. Click <strong className="text-gray-300">Add Alert</strong> to get started.
        </p>
      )}

      {/* Alert list */}
      {alerts.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-700/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-discord-darkest-bg">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Board</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Events</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Names</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Enabled</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {alerts.map((alert) => {
                  const ch = textChannels.find((c) => c.id === alert.discordChannelId);
                  const webhookUrl = `${API_URL}/monday/webhook/${alert.webhookToken}`;
                  return (
                    <Fragment key={alert.id}>
                      <tr className="hover:bg-discord-dark-bg/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-200">
                            {alert.boardName ?? <span className="text-gray-500 italic">All boards</span>}
                          </div>
                          {/* Webhook URL inline copy */}
                          <div className="flex items-center gap-1 mt-1 max-w-xs">
                            <span className="text-xs text-gray-600 font-mono truncate">{webhookUrl}</span>
                            <CopyButton text={webhookUrl} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {ch ? `#${ch.name}` : <span className="text-gray-600 text-xs">{alert.discordChannelId}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {alert.events.length === 0
                            ? <span className="text-green-400">All events</span>
                            : (
                              <span>
                                {alert.events
                                  .map((e) => ALL_EVENTS.find((ev) => ev.value === e)?.label ?? e)
                                  .join(', ')}
                              </span>
                            )
                          }
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {alert.hasApiToken
                            ? <span className="text-green-400">✓ Set</span>
                            : <span className="text-gray-600">—</span>}
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
                            onClick={() => handleEditOpen(alert)}
                            className="text-gray-400 hover:text-white transition-colors p-1"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(alert.id)}
                            disabled={deleteMutation.isPending}
                            className="text-gray-500 hover:text-red-400 transition-colors p-1"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Inline edit row */}
                      {editingId === alert.id && (
                        <tr className="bg-discord-darkest-bg">
                          <td colSpan={6} className="px-4 py-4">
                            <form onSubmit={handleUpdate} className="space-y-4">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-semibold text-white">Edit Alert</p>
                                <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div>
                                <label className="label">Board Name <span className="text-gray-500 font-normal">(optional)</span></label>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder="e.g. Marketing Tasks"
                                  value={editForm.boardName}
                                  onChange={(e) => setEditForm((f) => ({ ...f, boardName: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="label">
                                  Monday.com API Token{' '}
                                  {alert.hasApiToken
                                    ? <span className="text-green-400 font-normal text-xs">✓ currently set — paste new token to replace</span>
                                    : <span className="text-gray-500 font-normal">(optional — enables display names)</span>}
                                </label>
                                <input
                                  type="password"
                                  className="input"
                                  placeholder={alert.hasApiToken ? '••••••••••••••••' : 'eyJhbGciOiJIUzI1NiJ9…'}
                                  value={editForm.mondayApiToken}
                                  onChange={(e) => setEditForm((f) => ({ ...f, mondayApiToken: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="label">Event Filter <span className="text-gray-500 font-normal">(unchecked = all events)</span></label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                                  {ALL_EVENTS.map((ev) => (
                                    <label key={ev.value} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        className="w-3.5 h-3.5 accent-discord-blurple"
                                        checked={editForm.events.includes(ev.value)}
                                        onChange={() => setEditForm((f) => ({ ...f, events: toggleEvent(f.events, ev.value) }))}
                                      />
                                      {ev.label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button type="submit" disabled={editMutation.isPending} className="btn-primary">
                                  {editMutation.isPending ? 'Saving…' : 'Save'}
                                </button>
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

      {/* Supported events reference */}
      <SettingsSection title="Supported Events" description="Events ArkenBot can receive from monday.com webhooks.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALL_EVENTS.map((ev) => (
            <div key={ev.value} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-700/40 last:border-0">
              <span className="text-gray-300">{ev.label}</span>
              <span className="font-mono text-gray-600">{ev.value}</span>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
