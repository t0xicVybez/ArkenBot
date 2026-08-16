'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { birthdayApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import { Cake, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

type BirthdayConfig = {
  enabled?: boolean;
  channelId?: string;
  roleId?: string;
};

type Birthday = {
  userId: string;
  username: string;
  month: number;
  day: number;
};

export default function BirthdaysPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('birthdaysPage');
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<BirthdayConfig>({});

  const { data: configRes, isLoading: configLoading } = useQuery({
    queryKey: ['birthdays-config', guildId],
    queryFn: () => birthdayApi.getConfig(guildId),
  });

  const { data: birthdaysRes, isLoading: birthdaysLoading } = useQuery({
    queryKey: ['birthdays', guildId],
    queryFn: () => birthdayApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  useEffect(() => {
    if (configRes?.data) {
      const data = (configRes.data as { data?: BirthdayConfig }).data;
      if (data) setConfig(data);
    }
  }, [configRes]);

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const roles = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
  const birthdays: Birthday[] = (birthdaysRes?.data as { data?: Birthday[] })?.data ?? [];

  const configMutation = useMutation({
    mutationFn: (data: Partial<BirthdayConfig>) => birthdayApi.updateConfig(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['birthdays-config', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => birthdayApi.delete(guildId, userId),
    onSuccess: () => {
      toast.success(t('removed'));
      queryClient.invalidateQueries({ queryKey: ['birthdays', guildId] });
    },
    onError: () => toast.error(t('removeError')),
  });

  const handleConfigChange = (partial: Partial<BirthdayConfig>) => {
    const updated = { ...config, ...partial };
    setConfig(updated);
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
        <div className="page-head-icon"><Cake className="w-5 h-5" /></div>
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
        </div>
        <div>
          <label className="label">{t('role')}</label>
          <select
            className="input"
            value={config.roleId ?? ''}
            onChange={(e) => handleConfigChange({ roleId: e.target.value || undefined })}
          >
            <option value="">{t('noRole')}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>@{r.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('roleHelp')}</p>
        </div>
      </SettingsSection>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">{t('listTitle')}</h2>
        {birthdaysLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : birthdays.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {t('noBirthdays')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colUser')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colMonth')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colDay')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {birthdays.map((b) => (
                  <tr key={b.userId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300">{b.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-200">{b.month >= 1 && b.month <= 12 ? t(`month_${b.month}`) : b.month}</td>
                    <td className="px-4 py-3 text-sm text-gray-200">{b.day}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteMutation.mutate(b.userId)}
                        disabled={deleteMutation.isPending}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        title={t('removeBirthday')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
