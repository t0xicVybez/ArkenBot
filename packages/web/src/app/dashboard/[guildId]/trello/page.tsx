'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi, trelloApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';

const ALL_EVENTS = [
  { value: 'create_card',     label: 'Card Created' },
  { value: 'move_card',       label: 'Card Moved' },
  { value: 'rename_card',     label: 'Card Renamed' },
  { value: 'update_card',     label: 'Card Updated' },
  { value: 'archive_card',    label: 'Card Archived' },
  { value: 'unarchive_card',  label: 'Card Restored' },
  { value: 'delete_card',     label: 'Card Deleted' },
  { value: 'comment_card',    label: 'Comment Added' },
  { value: 'add_member',      label: 'Member Added' },
  { value: 'remove_member',   label: 'Member Removed' },
  { value: 'add_attachment',  label: 'Attachment Added' },
  { value: 'add_label',       label: 'Label Added' },
  { value: 'remove_label',    label: 'Label Removed' },
  { value: 'create_list',     label: 'List Created' },
  { value: 'rename_list',     label: 'List Renamed' },
  { value: 'checkitem_state', label: 'Checklist Toggled' },
];

type TrelloAlert = {
  id: string;
  discordChannelId: string;
  boardId: string | null;
  boardName: string | null;
  events: string[];
  enabled: boolean;
};

export default function TrelloPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const queryKey = ['trello-alerts', guildId];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ discordChannelId: '', board: '', trelloKey: '', trelloToken: '', events: [] as string[] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ boardName: '', events: [] as string[] });

  const { data: res, isLoading } = useQuery({
    queryKey,
    queryFn: () => trelloApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const alerts: TrelloAlert[] = (res?.data as { data?: TrelloAlert[] })?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: object) => trelloApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Trello alert created — webhook registered!');
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
      setForm({ discordChannelId: '', board: '', trelloKey: '', trelloToken: '', events: [] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to create alert'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      trelloApi.update(guildId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error('Failed to update alert'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      trelloApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success('Alert updated!');
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update alert'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trelloApi.delete(guildId, id),
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
    if (!form.board.trim()) return toast.error('Board URL or ID is required');
    if (!form.trelloKey.trim() || !form.trelloToken.trim()) return toast.error('Trello API key and token are required');
    createMutation.mutate({
      discordChannelId: form.discordChannelId,
      board: form.board.trim(),
      trelloKey: form.trelloKey.trim(),
      trelloToken: form.trelloToken.trim(),
      events: form.events,
    });
  };

  const handleEditOpen = (alert: TrelloAlert) => {
    setEditingId(alert.id);
    setEditForm({ boardName: alert.boardName ?? '', events: alert.events });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    editMutation.mutate({
      id: editingId,
      payload: { boardName: editForm.boardName.trim() || null, events: editForm.events },
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
      <div className="page-head">
        <div className="page-head-icon"><svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="3" fill="#0079BF"/>
            <rect x="3.5" y="3.5" width="7.2" height="14" rx="1.5" fill="#fff"/>
            <rect x="13.3" y="3.5" width="7.2" height="9" rx="1.5" fill="#fff"/>
          </svg></div>
        <div className="min-w-0">
          <h1>Trello Alerts</h1>
          <div className="page-head-desc">Post Discord notifications when Trello board events occur</div>
        </div>
        <div className="page-head-actions">
          <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Add Alert
        </button>
        </div>
      </div>

      {/* How it works */}
      <div className="card border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-300">How to connect Trello</p>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>Get your API key at <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">trello.com/power-ups/admin</a> (create a Power-Up, then &ldquo;Generate a new API key&rdquo;).</li>
          <li>On the same page, click <strong className="text-gray-300">Token</strong> next to your key to generate a token.</li>
          <li>Paste your board URL, key, and token below — ArkenBot registers the webhook with Trello automatically.</li>
          <li>Your key and token are <strong className="text-gray-300">used once and never stored</strong>.</li>
        </ol>
      </div>

      {/* Create form */}
      {showForm && (
        <SettingsSection title="New Trello Alert" description="ArkenBot registers the webhook with Trello for you — no manual webhook setup needed.">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Board URL or ID</label>
                <input
                  type="text"
                  className="input"
                  placeholder="https://trello.com/b/AbCd1234/my-board"
                  value={form.board}
                  onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Trello API Key</label>
                <input
                  type="password"
                  className="input"
                  placeholder="32-character key"
                  value={form.trelloKey}
                  onChange={(e) => setForm((f) => ({ ...f, trelloKey: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Trello Token</label>
                <input
                  type="password"
                  className="input"
                  placeholder="64-character token"
                  value={form.trelloToken}
                  onChange={(e) => setForm((f) => ({ ...f, trelloToken: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">Used once to register the webhook with Trello, then discarded — never stored on our servers.</p>

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
                {createMutation.isPending ? 'Registering webhook…' : 'Create Alert'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </SettingsSection>
      )}

      {/* Empty state */}
      {alerts.length === 0 && !showForm && (
        <div className="card empty-state" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon"><Plus className="w-6 h-6" /></div>
            <h4>Connect Trello</h4>
            <p>Connect a board and get a Discord embed for every card event — webhooks are registered automatically.</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">Add Alert</button>
          </div>
        </div>
      )}

      {/* Alert list */}
      {alerts.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="text-[13px] font-bold text-white">{alerts.length} board{alerts.length === 1 ? '' : 's'} connected</span>
          </div>
          {alerts.map((alert) => {
            const ch = textChannels.find((c) => c.id === alert.discordChannelId);
            return (
              <div key={alert.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <div className="group flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.018] transition-colors">
                  <div className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'rgba(0,121,191,0.16)' }}>
                    <svg style={{ width: 17, height: 17 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <rect width="24" height="24" rx="3" fill="#0079BF"/>
                      <rect x="3.5" y="3.5" width="7.2" height="14" rx="1.5" fill="#fff"/>
                      <rect x="13.3" y="3.5" width="7.2" height="9" rx="1.5" fill="#fff"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-white truncate">
                      {alert.boardName ?? <span className="text-gray-500 italic font-normal">Unknown board</span>}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)] truncate">
                      posts to {ch ? `#${ch.name}` : alert.discordChannelId}
                      {' · '}
                      {alert.events.length === 0 ? 'all events' : `${alert.events.length} event${alert.events.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  {alert.enabled && (
                    <span className="badge-success flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  )}
                  <Toggle
                    enabled={alert.enabled}
                    onChange={(v) => toggleMutation.mutate({ id: alert.id, enabled: v })}
                    disabled={toggleMutation.isPending}
                  />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEditOpen(alert)} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06]" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(alert.id)} disabled={deleteMutation.isPending} className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {editingId === alert.id && (
                  <div className="px-4 py-4 bg-[var(--bg-base)]/60 border-t border-[var(--border-subtle)]">
                    <form onSubmit={handleUpdate} className="space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-white">Edit Alert</p>
                        <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="label">Board Label <span className="text-gray-500 font-normal">(display name in embeds)</span></label>
                        <input type="text" className="input" placeholder="e.g. Sprint Board" value={editForm.boardName} onChange={(e) => setEditForm((f) => ({ ...f, boardName: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Event Filter <span className="text-gray-500 font-normal">(unchecked = all events)</span></label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                          {ALL_EVENTS.map((ev) => (
                            <label key={ev.value} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                              <input type="checkbox" className="w-3.5 h-3.5 accent-discord-blurple" checked={editForm.events.includes(ev.value)} onChange={() => setEditForm((f) => ({ ...f, events: toggleEvent(f.events, ev.value) }))} />
                              {ev.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={editMutation.isPending} className="btn-primary">{editMutation.isPending ? 'Saving…' : 'Save'}</button>
                        <button type="button" onClick={() => setEditingId(null)} className="btn-secondary">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Supported events reference */}
      <SettingsSection title="Supported Events" description="Trello board actions ArkenBot can turn into Discord notifications.">
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
