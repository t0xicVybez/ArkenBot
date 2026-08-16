'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, ExternalLink } from 'lucide-react';
import { guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';

type StarboardConfig = {
  enabled?: boolean;
  channelId?: string;
  threshold?: number;
  emoji?: string;
  selfStar?: boolean;
};

type StarboardEntry = {
  id: string;
  starCount: number;
  authorId: string;
  messagePreview: string;
  messageUrl: string;
  createdAt: string;
};

const starboardApi = {
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/starboard/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/starboard/config`, data),
  list: (guildId: string) => api.get(`/guilds/${guildId}/starboard/entries`),
};

export default function StarboardPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('starboardPage');
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<StarboardConfig>({});

  const { data: configRes, isLoading: configLoading } = useQuery({
    queryKey: ['starboard-config', guildId],
    queryFn: () => starboardApi.getConfig(guildId),
  });

  const { data: entriesRes, isLoading: entriesLoading } = useQuery({
    queryKey: ['starboard-entries', guildId],
    queryFn: () => starboardApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    if (configRes?.data) {
      const data = (configRes.data as { data?: StarboardConfig }).data;
      if (data) setConfig(data);
    }
  }, [configRes]);

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const entries: StarboardEntry[] = (entriesRes?.data as { data?: StarboardEntry[] })?.data ?? [];

  const configMutation = useMutation({
    mutationFn: (data: Partial<StarboardConfig>) => starboardApi.updateConfig(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['starboard-config', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const handleConfigChange = (partial: Partial<StarboardConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
    configMutation.mutate(partial);
  };

  if (configLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-4xl space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card h-40 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Star className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <SettingsSection title={t('configTitle')} description={t('configDesc')}>
        <Toggle
          label={t('enable')}
          description={t('enableDesc')}
          enabled={config.enabled ?? false}
          onChange={(v) => handleConfigChange({ enabled: v })}
        />
        <div>
          <label className="label">{t('channel')}</label>
          <select
            className="input"
            value={config.channelId ?? ''}
            onChange={(e) => handleConfigChange({ channelId: e.target.value || undefined })}
          >
            <option value="">{t('selectChannel')}</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('channelHelp')}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('threshold')}</label>
            <input
              type="number"
              className="input"
              value={config.threshold ?? 3}
              min={1}
              max={50}
              onChange={(e) => setConfig((c) => ({ ...c, threshold: parseInt(e.target.value) }))}
              onBlur={() => handleConfigChange({ threshold: config.threshold })}
            />
            <p className="text-xs text-gray-500 mt-1">{t('thresholdHelp')}</p>
          </div>
          <div>
            <label className="label">{t('emoji')}</label>
            <input
              type="text"
              className="input"
              value={config.emoji ?? '⭐'}
              placeholder="⭐"
              onChange={(e) => setConfig((c) => ({ ...c, emoji: e.target.value }))}
              onBlur={() => handleConfigChange({ emoji: config.emoji })}
            />
            <p className="text-xs text-gray-500 mt-1">{t('emojiHelp')}</p>
          </div>
        </div>
        <Toggle
          label={t('selfStar')}
          description={t('selfStarDesc')}
          enabled={config.selfStar ?? false}
          onChange={(v) => handleConfigChange({ selfStar: v })}
        />
      </SettingsSection>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">{t('topTitle')}</h2>
        {entriesLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10">
            {t('noEntries')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colStars')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colAuthor')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colMessage')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-yellow-400 font-semibold text-sm">
                        ⭐ {entry.starCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-300">{entry.authorId}</td>
                    <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{entry.messagePreview}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={entry.messageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-discord-blurple transition-colors"
                        title={t('jumpToMessage')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
