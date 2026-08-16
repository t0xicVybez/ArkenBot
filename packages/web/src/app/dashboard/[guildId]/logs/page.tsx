'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { moderationApi, settingsApi, guildsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import { FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { GuildSettings } from '@arkenbot/shared';
import { useTranslations } from 'next-intl';

const TYPE_KEYS = [
  'member_join', 'member_leave', 'message_delete', 'message_edit',
  'member_ban', 'member_unban', 'member_kick', 'member_timeout',
  'role_create', 'role_delete', 'channel_create', 'channel_delete',
];

function getDetails(type: string, data: Record<string, unknown> | null, noContent: string): string {
  if (!data) return '—';
  if (type === 'message_delete') {
    const content = data.content ? String(data.content).slice(0, 80) : null;
    return content ? `"${content}"` : noContent;
  }
  if (type === 'message_edit') {
    const before = data.before ? String(data.before).slice(0, 40) : '';
    const after = data.after ? String(data.after).slice(0, 40) : '';
    return before || after ? `${before} → ${after}` : noContent;
  }
  if (type.startsWith('member_') && data.reason) return String(data.reason);
  if (data.userTag) return String(data.userTag);
  return '—';
}

export default function LogsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('logsPage');
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<GuildSettings>>({});
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [userIdFilter, setUserIdFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const { data: settingsRes } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: logsRes, isLoading } = useQuery({
    queryKey: ['logs', guildId, typeFilter, userIdFilter, dateFrom, dateTo],
    queryFn: () => moderationApi.getLogs(guildId, {
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(userIdFilter.trim() ? { userId: userIdFilter.trim() } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (settingsRes?.data?.data) setSettings(settingsRes.data.data);
  }, [settingsRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<GuildSettings>) => settingsApi.update(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['settings', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const handleSave = (partial: Partial<GuildSettings>) => mutation.mutate(partial);

  const channels = (channelsRes?.data?.data ?? []) as Array<{ id: string; name: string; type: number }>;
  const textChannels = channels.filter((c) => c.type === 0);

  const logs = (logsRes?.data?.data?.items ?? []) as Array<{
    id: string;
    type: string;
    userId: string | null;
    data: Record<string, unknown> | null;
    createdAt: string;
  }>;

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><FileText className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <SettingsSection title={t('loggingTitle')} description={t('loggingDesc')}>
        <Toggle
          label={t('enable')}
          description={t('enableDesc')}
          enabled={settings.loggingEnabled ?? false}
          onChange={(v) => {
            setSettings((s) => ({ ...s, loggingEnabled: v }));
            handleSave({ loggingEnabled: v });
          }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="label">{t('generalLogChannel')}</label>
            <select
              className="input"
              value={settings.logChannelId ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, logChannelId: e.target.value || undefined }))}
              onBlur={() => handleSave({ logChannelId: settings.logChannelId })}
            >
              <option value="">{t('none')}</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('modLogChannel')}</label>
            <select
              className="input"
              value={settings.modLogChannelId ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, modLogChannelId: e.target.value || undefined }))}
              onBlur={() => handleSave({ modLogChannelId: settings.modLogChannelId })}
            >
              <option value="">{t('none')}</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
        </div>
      </SettingsSection>

      {/* User ID + Date range filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">{t('userId')}</label>
          <input
            type="text"
            className="input h-8 text-sm w-44"
            placeholder={t('userIdPlaceholder')}
            value={userIdFilter}
            onChange={(e) => setUserIdFilter(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">{t('from')}</label>
          <input
            type="date"
            className="input h-8 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">{t('to')}</label>
          <input
            type="date"
            className="input h-8 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {(userIdFilter || dateFrom || dateTo) && (
          <button
            className="px-3 py-1.5 text-xs bg-white/[0.06] text-gray-400 hover:text-white rounded-lg transition-colors h-8"
            onClick={() => { setUserIdFilter(''); setDateFrom(''); setDateTo(''); }}
          >
            {t('clear')}
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setTypeFilter('')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${typeFilter === '' ? 'bg-discord-blurple text-white' : 'bg-white/[0.06] text-gray-400 hover:text-white'}`}
        >
          {t('all')}
        </button>
        {TYPE_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setTypeFilter(typeFilter === key ? '' : key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${typeFilter === key ? 'bg-discord-blurple text-white' : 'bg-white/[0.06] text-gray-400 hover:text-white'}`}
          >
            {t(`type_${key}`)}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-[var(--bg-base)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colEvent')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colUser')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colDetails')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colTime')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4} className="px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                  {t('noLogs')}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm text-white">
                      {TYPE_KEYS.includes(log.type) ? t(`type_${log.type}`) : log.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(() => {
                      const tag = (log.data?.userTag ?? log.data?.authorTag) as string | undefined;
                      const id = log.userId;
                      if (tag) return (
                        <div>
                          <span className="text-gray-200">{tag}</span>
                          {id && <p className="text-xs text-gray-500 font-mono">{id}</p>}
                        </div>
                      );
                      return <span className="text-gray-400 font-mono">{id ?? '—'}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {getDetails(log.type, log.data, t('noContent'))}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
