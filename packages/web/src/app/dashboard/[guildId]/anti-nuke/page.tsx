'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { ShieldAlert, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

type AntiNukeConfig = {
  enabled: boolean;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  banThreshold: number;
  action: 'deop' | 'kick' | 'ban';
  alertChannelId?: string | null;
};

const antiNukeApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/anti-nuke/config`),
  update: (guildId: string, data: Partial<AntiNukeConfig>) =>
    api.patch(`/guilds/${guildId}/anti-nuke/config`, data),
};

const DEFAULT_CONFIG: AntiNukeConfig = {
  enabled: false,
  channelDeleteThreshold: 3,
  roleDeleteThreshold: 3,
  banThreshold: 5,
  action: 'deop',
  alertChannelId: null,
};

export default function AntiNukePage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('antiNukePage');
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AntiNukeConfig>(DEFAULT_CONFIG);

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['anti-nuke-config', guildId],
    queryFn: () => antiNukeApi.get(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    const cfg = (configRes?.data as { data?: AntiNukeConfig })?.data;
    if (cfg) setConfig({ ...DEFAULT_CONFIG, ...cfg });
  }, [configRes]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<AntiNukeConfig>) => antiNukeApi.update(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['anti-nuke-config', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <div className="page-head">
        <div className="page-head-icon"><ShieldAlert className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Info card */}
      <div className="card mb-6 border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">
          {t('infoText')}
        </p>
      </div>

      <SettingsSection title={t('title')} description={t('sectionDesc')}>
        <Toggle
          label={t('enable')}
          description={t('enableDesc')}
          enabled={config.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
      </SettingsSection>

      <SettingsSection title={t('thresholdsTitle')} description={t('thresholdsDesc')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">{t('channelDeleteThreshold')}</label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={config.channelDeleteThreshold}
              onChange={(e) => setConfig((c) => ({ ...c, channelDeleteThreshold: parseInt(e.target.value) || 3 }))}
            />
            <p className="text-xs text-gray-500 mt-1">{t('channelsDeleted')}</p>
          </div>
          <div>
            <label className="label">{t('roleDeleteThreshold')}</label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={config.roleDeleteThreshold}
              onChange={(e) => setConfig((c) => ({ ...c, roleDeleteThreshold: parseInt(e.target.value) || 3 }))}
            />
            <p className="text-xs text-gray-500 mt-1">{t('rolesDeleted')}</p>
          </div>
          <div>
            <label className="label">{t('massBanThreshold')}</label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={config.banThreshold}
              onChange={(e) => setConfig((c) => ({ ...c, banThreshold: parseInt(e.target.value) || 5 }))}
            />
            <p className="text-xs text-gray-500 mt-1">{t('bansIssued')}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('responseTitle')} description={t('responseDesc')}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('actionOnTrigger')}</label>
            <select
              className="input"
              value={config.action}
              onChange={(e) => setConfig((c) => ({ ...c, action: e.target.value as AntiNukeConfig['action'] }))}
            >
              <option value="deop">{t('actionDeop')}</option>
              <option value="kick">{t('actionKick')}</option>
              <option value="ban">{t('actionBan')}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('actionHelp')}</p>
          </div>
          <div>
            <label className="label">{t('alertChannel')}</label>
            <select
              className="input"
              value={config.alertChannelId ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, alertChannelId: e.target.value || null }))}
            >
              <option value="">{t('none')}</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('alertChannelHelp')}</p>
          </div>
        </div>
      </SettingsSection>

      <div className="mt-4">
        <button
          onClick={() => saveMutation.mutate(config)}
          disabled={saveMutation.isPending}
          className="btn-primary"
        >
          {saveMutation.isPending ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>
  );
}
