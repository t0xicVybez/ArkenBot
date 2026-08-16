'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi, trelloApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ALL_EVENTS = [
  'create_card', 'move_card', 'rename_card', 'update_card', 'archive_card', 'unarchive_card',
  'delete_card', 'comment_card', 'add_member', 'remove_member', 'add_attachment', 'add_label',
  'remove_label', 'create_list', 'rename_list', 'checkitem_state',
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
  const t = useTranslations('trelloPage');
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
      toast.success(t('created'));
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
      setForm({ discordChannelId: '', board: '', trelloKey: '', trelloToken: '', events: [] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => toast.error(err?.response?.data?.error ?? t('createError')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      trelloApi.update(guildId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error(t('updateError')),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      trelloApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success(t('alertUpdated'));
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
    onError: () => toast.error(t('updateError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trelloApi.delete(guildId, id),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error(t('deleteError')),
  });

  const toggleEvent = (list: string[], value: string) =>
    list.includes(value) ? list.filter((e) => e !== value) : [...list, value];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.discordChannelId) return toast.error(t('channelRequired'));
    if (!form.board.trim()) return toast.error(t('boardRequired'));
    if (!form.trelloKey.trim() || !form.trelloToken.trim()) return toast.error(t('keyTokenRequired'));
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
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
        <div className="page-head-actions">
          <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          {t('addAlert')}
        </button>
        </div>
      </div>

      {/* How it works */}
      <div className="card border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-300">{t('howToTitle')}</p>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>{t.rich('howStep1', { a: (c) => <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">{c}</a> })}</li>
          <li>{t.rich('howStep2', { b: (c) => <strong className="text-gray-300">{c}</strong> })}</li>
          <li>{t('howStep3')}</li>
          <li>{t.rich('howStep4', { b: (c) => <strong className="text-gray-300">{c}</strong> })}</li>
        </ol>
      </div>

      {/* Create form */}
      {showForm && (
        <SettingsSection title={t('newAlertTitle')} description={t('newAlertDesc')}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{t('boardUrlId')}</label>
                <input
                  type="text"
                  className="input"
                  placeholder="https://trello.com/b/AbCd1234/my-board"
                  value={form.board}
                  onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t('discordChannel')}</label>
                <select
                  className="input"
                  value={form.discordChannelId}
                  onChange={(e) => setForm((f) => ({ ...f, discordChannelId: e.target.value }))}
                >
                  <option value="">{t('selectChannel')}</option>
                  {textChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{t('apiKey')}</label>
                <input
                  type="password"
                  className="input"
                  placeholder={t('apiKeyPlaceholder')}
                  value={form.trelloKey}
                  onChange={(e) => setForm((f) => ({ ...f, trelloKey: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t('token')}</label>
                <input
                  type="password"
                  className="input"
                  placeholder={t('tokenPlaceholder')}
                  value={form.trelloToken}
                  onChange={(e) => setForm((f) => ({ ...f, trelloToken: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">{t('credsNote')}</p>

            <div>
              <label className="label">{t('eventFilter')} <span className="text-gray-500 font-normal">{t('eventFilterHint')}</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {ALL_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-discord-blurple"
                      checked={form.events.includes(ev)}
                      onChange={() => setForm((f) => ({ ...f, events: toggleEvent(f.events, ev) }))}
                    />
                    {t(`event_${ev}`)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? t('registeringWebhook') : t('createAlert')}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">{t('cancel')}</button>
            </div>
          </form>
        </SettingsSection>
      )}

      {/* Empty state */}
      {alerts.length === 0 && !showForm && (
        <div className="card empty-state" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon"><Plus className="w-6 h-6" /></div>
            <h4>{t('emptyTitle')}</h4>
            <p>{t('emptyDesc')}</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">{t('addAlert')}</button>
          </div>
        </div>
      )}

      {/* Alert list */}
      {alerts.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="text-[13px] font-bold text-white">{t('boardsCount', { count: alerts.length })}</span>
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
                      {alert.boardName ?? <span className="text-gray-500 italic font-normal">{t('unknownBoard')}</span>}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)] truncate">
                      {t('postsTo', { channel: ch ? `#${ch.name}` : alert.discordChannelId })}
                      {' · '}
                      {alert.events.length === 0 ? t('allEventsLower') : t('eventCount', { count: alert.events.length })}
                    </p>
                  </div>
                  {alert.enabled && (
                    <span className="badge-success flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {t('active')}
                    </span>
                  )}
                  <Toggle
                    enabled={alert.enabled}
                    onChange={(v) => toggleMutation.mutate({ id: alert.id, enabled: v })}
                    disabled={toggleMutation.isPending}
                  />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEditOpen(alert)} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06]" title={t('edit')}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(alert.id)} disabled={deleteMutation.isPending} className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10" title={t('delete')}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {editingId === alert.id && (
                  <div className="px-4 py-4 bg-[var(--bg-base)]/60 border-t border-[var(--border-subtle)]">
                    <form onSubmit={handleUpdate} className="space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-white">{t('editAlert')}</p>
                        <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="label">{t('boardLabel')} <span className="text-gray-500 font-normal">{t('boardLabelHint')}</span></label>
                        <input type="text" className="input" placeholder={t('boardLabelPlaceholder')} value={editForm.boardName} onChange={(e) => setEditForm((f) => ({ ...f, boardName: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">{t('eventFilter')} <span className="text-gray-500 font-normal">{t('eventFilterUnchecked')}</span></label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                          {ALL_EVENTS.map((ev) => (
                            <label key={ev} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                              <input type="checkbox" className="w-3.5 h-3.5 accent-discord-blurple" checked={editForm.events.includes(ev)} onChange={() => setEditForm((f) => ({ ...f, events: toggleEvent(f.events, ev) }))} />
                              {t(`event_${ev}`)}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={editMutation.isPending} className="btn-primary">{editMutation.isPending ? t('saving') : t('save')}</button>
                        <button type="button" onClick={() => setEditingId(null)} className="btn-secondary">{t('cancel')}</button>
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
      <SettingsSection title={t('supportedTitle')} description={t('supportedDesc')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALL_EVENTS.map((ev) => (
            <div key={ev} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-700/40 last:border-0">
              <span className="text-gray-300">{t(`event_${ev}`)}</span>
              <span className="font-mono text-gray-600">{ev}</span>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
