'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi, mondayApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Plus, Trash2, Pencil, X, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.arkenbot.app';

const ALL_EVENTS = [
  'create_item', 'delete_item', 'update_name', 'change_column_value',
  'create_subitem', 'move_item_to_group', 'create_update', 'archive_item',
  'restore_item', 'create_group', 'delete_group', 'duplicate_item',
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
  const t = useTranslations('mondayPage');
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
      title={t('copyWebhook')}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function MondayPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('mondayPage');
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
      toast.success(t('created'));
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
      setForm({ discordChannelId: '', boardName: '', mondayApiToken: '', events: [] });
    },
    onError: () => toast.error(t('createError')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      mondayApi.update(guildId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error(t('updateError')),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      mondayApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success(t('alertUpdated'));
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
    onError: () => toast.error(t('updateError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mondayApi.delete(guildId, id),
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
      <div className="page-head">
        <div className="page-head-icon"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="4.5" cy="12" r="3.5" fill="#ff3d57"/>
            <circle cx="12" cy="12" r="3.5" fill="#ffcb00"/>
            <circle cx="19.5" cy="12" r="3.5" fill="#00ca72"/>
          </svg></div>
        <div className="min-w-0">
          <h1>monday.com Alerts</h1>
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
          <li>{t('howStep1')}</li>
          <li>{t.rich('howStep2', { b: (c) => <strong className="text-gray-300">{c}</strong> })}</li>
          <li>{t('howStep3')}</li>
          <li>{t('howStep4')}</li>
        </ol>
      </div>

      {/* Create form */}
      {showForm && (
        <SettingsSection title={t('newAlertTitle')} description={t('newAlertDesc')}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{t('boardName')} <span className="text-gray-500 font-normal">{t('boardNameOptional')}</span></label>
                <input
                  type="text"
                  className="input"
                  placeholder={t('boardNamePlaceholder')}
                  value={form.boardName}
                  onChange={(e) => setForm((f) => ({ ...f, boardName: e.target.value }))}
                />
                <p className="text-xs text-gray-500 mt-1">{t('boardNameHelp')}</p>
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

            <div>
              <label className="label">
                {t('apiToken')} <span className="text-gray-500 font-normal">{t('apiTokenOptional')}</span>
              </label>
              <input
                type="password"
                className="input"
                placeholder="eyJhbGciOiJIUzI1NiJ9…"
                value={form.mondayApiToken}
                onChange={(e) => setForm((f) => ({ ...f, mondayApiToken: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t.rich('apiTokenHelp', { b: (c) => <strong className="text-gray-400">{c}</strong> })}
              </p>
            </div>

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
                {createMutation.isPending ? t('creating') : t('createAlert')}
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
            <span className="text-[13px] font-bold text-white">{t('alertCount', { count: alerts.length })}</span>
          </div>
          {alerts.map((alert) => {
            const ch = textChannels.find((c) => c.id === alert.discordChannelId);
            const webhookUrl = `${API_URL}/monday/webhook/${alert.webhookToken}`;
            return (
              <div key={alert.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <div className="group flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.018] transition-colors">
                  <div className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'rgba(255,203,0,0.10)' }}>
                    <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="4.5" cy="12" r="3.5" fill="#ff3d57"/><circle cx="12" cy="12" r="3.5" fill="#ffcb00"/><circle cx="19.5" cy="12" r="3.5" fill="#00ca72"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-white truncate">
                      {alert.boardName ?? <span className="text-gray-500 italic font-normal">{t('allBoards')}</span>}
                      <span className="font-normal text-[var(--text-muted)]">{t('postsTo', { channel: ch ? `#${ch.name}` : alert.discordChannelId })}</span>
                    </p>
                    <div className="flex items-center gap-1 mt-0.5 max-w-md">
                      <span className="text-[11px] text-[var(--text-muted)] font-mono truncate">{webhookUrl}</span>
                      <CopyButton text={webhookUrl} />
                    </div>
                  </div>
                  <span className="text-[11.5px] text-[var(--text-muted)] hidden sm:block flex-shrink-0">
                    {alert.events.length === 0 ? t('allEvents') : t('eventCount', { count: alert.events.length })}
                  </span>
                  {alert.hasApiToken && <span className="badge-success flex-shrink-0">{t('namesBadge')}</span>}
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
                        <label className="label">{t('boardName')} <span className="text-gray-500 font-normal">{t('optionalLabel')}</span></label>
                        <input type="text" className="input" placeholder={t('boardNamePlaceholder')} value={editForm.boardName} onChange={(e) => setEditForm((f) => ({ ...f, boardName: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">
                          {t('apiToken')}{' '}
                          {alert.hasApiToken
                            ? <span className="text-green-400 font-normal text-xs">{t('apiTokenSet')}</span>
                            : <span className="text-gray-500 font-normal">{t('apiTokenOptional')}</span>}
                        </label>
                        <input type="password" className="input" placeholder={alert.hasApiToken ? '••••••••••••••••' : 'eyJhbGciOiJIUzI1NiJ9…'} value={editForm.mondayApiToken} onChange={(e) => setEditForm((f) => ({ ...f, mondayApiToken: e.target.value }))} />
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
