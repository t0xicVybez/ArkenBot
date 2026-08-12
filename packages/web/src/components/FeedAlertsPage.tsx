'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import { streamAlertsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, type ComponentType } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface PlatformConfig {
  value: string;
  label: string;
  badgeClass: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  variables: string;
  messagePlaceholder?: string;
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
  lastStreamId?: string | null;
  failureCount?: number;
  lastError?: string | null;
};

/** Per-platform icon tile treatment for the alert list. */
const PLATFORM_VISUALS: Record<string, { glyph: string; bg: string; fg: string }> = {
  twitch:  { glyph: 'T', bg: 'rgba(145,70,255,0.18)',  fg: '#b795ff' },
  kick:    { glyph: 'K', bg: 'rgba(83,252,24,0.14)',   fg: '#7ef15a' },
  youtube: { glyph: '▶', bg: 'rgba(255,0,0,0.16)',     fg: '#ff6b6b' },
  twitter: { glyph: '𝕏', bg: 'rgba(255,255,255,0.10)', fg: '#e7e9ee' },
  reddit:  { glyph: 'r/', bg: 'rgba(255,69,0,0.16)',   fg: '#ff8a5c' },
  rss:     { glyph: '⊙', bg: 'rgba(245,158,11,0.16)',  fg: '#f5b04b' },
};

/** Platforms where a stored stream ID means "currently live". */
const LIVE_PLATFORMS = new Set(['twitch', 'kick', 'youtube']);

export function FeedAlertsPage({ title, description, icon: Icon, platforms, notice }: FeedAlertsPageProps) {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const t = useTranslations('feedAlerts');
  const tc = useTranslations('common');

  const platformValues = platforms.map((p) => p.value);
  const defaultPlatform = platforms[0].value;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: defaultPlatform, username: '', discordChannelId: '', message: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: '', message: '' });
  const [filter, setFilter] = useState<string>('all');

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
  const visibleAlerts = filter === 'all' ? alerts : alerts.filter((a) => a.platform === filter);

  const platformMap = Object.fromEntries(platforms.map((p) => [p.value, p]));
  const currentPlatformConfig = platformMap[form.platform] ?? platforms[0];

  const createMutation = useMutation({
    mutationFn: (data: object) => streamAlertsApi.create(guildId, data),
    onSuccess: () => {
      toast.success(t('created'));
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
      setForm({ platform: defaultPlatform, username: '', discordChannelId: '', message: '' });
    },
    onError: () => toast.error(t('createError')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      streamAlertsApi.update(guildId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error(t('updateError')),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      streamAlertsApi.update(guildId, id, payload),
    onSuccess: () => {
      toast.success(t('updated'));
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
    onError: () => toast.error(t('updateError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => streamAlertsApi.delete(guildId, id),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error(t('deleteError')),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.discordChannelId) return toast.error(t('channelRequired'));
    if (!form.username.trim()) return toast.error(t('sourceRequired'));
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
    <div className="p-3 sm:p-6 max-w-4xl space-y-5">
      {/* Page head: icon tile · title · purpose · action */}
      <div className="page-head">
        <div className="page-head-icon">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1>{title}</h1>
          <div className="page-head-desc">{description}</div>
        </div>
        <div className="page-head-actions">
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('newAlert')}
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert-warning text-xs">{notice}</div>
      )}

      {/* Platform filter chips */}
      {platforms.length > 1 && alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[{ value: 'all', label: t('all') }, ...platforms].map((p) => (
            <button
              key={p.value}
              onClick={() => setFilter(p.value)}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                filter === p.value
                  ? 'bg-[var(--accent-glow)] text-[var(--accent)] border-[var(--accent)]/40'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <SettingsSection title={t('newAlertTitle')} description={t('newAlertDesc')}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {platforms.length > 1 && (
                <div>
                  <label className="label">{t('platform')}</label>
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
              <label className="label">{t('customMessage')} <span className="text-gray-500 font-normal">{t('optional')}</span></label>
              <input
                type="text"
                className="input"
                placeholder={currentPlatformConfig.messagePlaceholder ?? 'e.g. {title} — {url}'}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">{t('variables')} {currentPlatformConfig.variables}</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? t('creating') : t('createButton')}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">{tc('cancel')}</button>
            </div>
          </form>
        </SettingsSection>
      )}

      {alerts.length === 0 && !showForm && (
        <div className="card empty-state">
          <div className="empty-state-icon"><Plus className="w-6 h-6" /></div>
          <h4>{t('noAlertsTitle')}</h4>
          <p>{t('noAlertsDesc')}</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">{t('createFirst')}</button>
        </div>
      )}

      {/* Alert list — rows, not a table */}
      {visibleAlerts.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="text-[13px] font-bold text-white">
              {t('alertCount', { count: visibleAlerts.length })}
            </span>
          </div>
          {visibleAlerts.map((alert) => {
            const ch = textChannels.find((c) => c.id === alert.discordChannelId);
            const pc = platformMap[alert.platform];
            const vis = PLATFORM_VISUALS[alert.platform] ?? { glyph: '•', bg: 'var(--bg-elevated)', fg: 'var(--text-secondary)' };
            const isLive = LIVE_PLATFORMS.has(alert.platform) && !!alert.lastStreamId && alert.enabled;
            return (
              <div key={alert.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <div className="group flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.018] transition-colors">
                  <div
                    className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 text-[13px] font-bold"
                    style={{ background: vis.bg, color: vis.fg }}
                  >
                    {vis.glyph}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-white truncate">{alert.channelUsername}</p>
                    <p className="text-[12px] text-[var(--text-muted)] truncate">
                      {pc?.label ?? alert.platform} · {t('postsTo')} {ch ? `#${ch.name}` : alert.discordChannelId}
                    </p>
                    {!alert.enabled && alert.lastError && (
                      <p className="text-[11px] text-red-400/90 truncate mt-0.5" title={alert.lastError}>
                        {t('autoDisabled', { error: alert.lastError })}
                      </p>
                    )}
                  </div>
                  {isLive && (
                    <span className="badge-success flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t('liveNow')}
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
                    <form onSubmit={handleUpdate} className="space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-white">{t('editAlert')}</p>
                        <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">{t('sourceUrl')}</label>
                          <input type="text" className="input" value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} />
                        </div>
                        <div>
                          <label className="label">{t('customMessage')}</label>
                          <input type="text" className="input" value={editForm.message} onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={editMutation.isPending} className="btn-primary">{editMutation.isPending ? t('saving') : tc('save')}</button>
                        <button type="button" onClick={() => setEditingId(null)} className="btn-secondary">{tc('cancel')}</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
