'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduledMessagesApi, guildsApi } from '@/lib/api';
import { Clock, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Toggle } from '@/components/Toggle';
import { useTranslations, useLocale } from 'next-intl';

type ScheduledMessage = {
  id: string;
  channelId: string;
  content: string;
  scheduledAt: string;
  repeat: 'none' | 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
  roleMentionId?: string | null;
  timezone?: string | null;
  daysOfWeek?: number[];
  failureCount?: number;
  lastError?: string | null;
};

const REPEAT_VALUES = ['none', 'hourly', 'daily', 'weekly'] as const;

const TIMEZONES = [
  'UTC',
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Atlantic/Azores',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Athens', 'Europe/Moscow',
  'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
];

export default function ScheduledMessagesPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('scheduledMessagesPage');
  const queryClient = useQueryClient();

  const [newChannelId, setNewChannelId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [newRepeat, setNewRepeat] = useState<'none' | 'hourly' | 'daily' | 'weekly'>('none');
  const [newRoleMentionId, setNewRoleMentionId] = useState('');
  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const [newTimezone, setNewTimezone] = useState<string>(browserTz || 'UTC');
  const [newDays, setNewDays] = useState<number[]>([]);
  const locale = useLocale();
  const dayName = (d: number) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + d)));
  const toggleDay = (d: number) =>
    setNewDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  const timezoneOptions = TIMEZONES.includes(newTimezone) ? TIMEZONES : [newTimezone, ...TIMEZONES];
  const tzOffset = (tz: string) => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
      return (parts.find((x) => x.type === 'timeZoneName')?.value ?? '').replace('GMT', 'UTC');
    } catch {
      return '';
    }
  };
  const tzLabel = (tz: string) => {
    if (tz === 'UTC') return 'UTC';
    const off = tzOffset(tz);
    return off ? `${tz.replace(/_/g, ' ')} (${off})` : tz.replace(/_/g, ' ');
  };

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
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
    },
    onError: () => toast.error(t('deleteError')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      scheduledMessagesApi.update(guildId, id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
    },
    onError: () => toast.error(t('updateError')),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => scheduledMessagesApi.create(guildId, data),
    onSuccess: () => {
      toast.success(t('created'));
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
      setNewChannelId('');
      setNewContent('');
      setNewScheduledAt('');
      setNewRepeat('none');
      setNewRoleMentionId('');
    },
    onError: () => toast.error(t('createError')),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelId) return toast.error(t('selectChannelError'));
    if (!newContent.trim()) return toast.error(t('enterMessageError'));
    if (!newScheduledAt) return toast.error(t('selectDateError'));
    createMutation.mutate({
      channelId: newChannelId,
      content: newContent,
      scheduledAt: newScheduledAt, // naive wall-clock; interpreted in the chosen timezone by the API
      repeat: newRepeat,
      timezone: newTimezone,
      ...(newRepeat === 'weekly' ? { daysOfWeek: newDays } : {}),
      ...(newRoleMentionId ? { roleMentionId: newRoleMentionId } : {}),
    });
  };

  const getChannelName = (channelId: string) => {
    const ch = textChannels.find((c) => c.id === channelId);
    return ch ? `#${ch.name}` : channelId;
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Clock className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <div className="card mb-6 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
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
            <p className="text-sm">{t('noMessages')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-[var(--bg-base)]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colChannel')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colContent')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colScheduled')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colRepeat')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colEnabled')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {messages.map((msg) => (
                <tr key={msg.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-200">{getChannelName(msg.channelId)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">
                    {msg.content.length > 50 ? `${msg.content.slice(0, 50)}…` : msg.content}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                    {new Date(msg.scheduledAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{t(`repeat_${msg.repeat}`)}</td>
                  <td className="px-4 py-3">
                    <Toggle
                      enabled={msg.enabled}
                      onChange={(v) => toggleMutation.mutate({ id: msg.id, enabled: v })}
                      disabled={toggleMutation.isPending}
                    />
                    {!msg.enabled && msg.lastError && (
                      <p className="text-[11px] text-red-400/90 mt-1 max-w-[200px]" title={msg.lastError}>
                        {t('autoDisabled', { error: msg.lastError })}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteMutation.mutate(msg.id)}
                      disabled={deleteMutation.isPending}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title={t('deleteMessage')}
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
        <h2 className="text-lg font-semibold text-white mb-4">{t('createTitle')}</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">{t('channel')}</label>
            <select
              className="input"
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              required
            >
              <option value="">{t('selectChannel')}</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('messageContent')}</label>
            <textarea
              className="input min-h-[100px] resize-y"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t('messagePlaceholder')}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('scheduleDateTime')}</label>
              <input
                type="datetime-local"
                className="input"
                value={newScheduledAt}
                onChange={(e) => setNewScheduledAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">{t('repeat')}</label>
              <select
                className="input"
                value={newRepeat}
                onChange={(e) => setNewRepeat(e.target.value as typeof newRepeat)}
              >
                {REPEAT_VALUES.map((v) => (
                  <option key={v} value={v}>{t(`repeat_${v}`)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">{t('timezone')}</label>
            <select
              className="input"
              value={newTimezone}
              onChange={(e) => setNewTimezone(e.target.value)}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>{tzLabel(tz)}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('timezoneHelp')}</p>
          </div>
          {newRepeat === 'weekly' && (
            <div>
              <label className="label">{t('daysLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`px-3 py-1.5 rounded-md text-sm border capitalize ${newDays.includes(d) ? 'bg-discord-blurple border-discord-blurple text-white' : 'border-[var(--border-subtle)] text-gray-300 hover:border-discord-blurple/50'}`}
                  >
                    {dayName(d)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('daysHelp')}</p>
            </div>
          )}
          <div>
            <label className="label">{t('pingRole')}</label>
            <select
              className="input"
              value={newRoleMentionId}
              onChange={(e) => setNewRoleMentionId(e.target.value)}
            >
              <option value="">{t('noRolePing')}</option>
              {roles.filter((r) => r.name !== '@everyone').map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('pingRoleHelp')}</p>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? t('scheduling') : t('scheduleMessage')}
          </button>
        </form>
      </div>
    </div>
  );
}
