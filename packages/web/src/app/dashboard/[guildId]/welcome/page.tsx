'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import type { WelcomeConfig } from '@arkenbot/shared';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function WelcomePage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('welcomePage');
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Partial<WelcomeConfig>>({});

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['welcome', guildId],
    queryFn: () => settingsApi.getWelcome(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    if (configRes?.data?.data) setConfig(configRes.data.data as Partial<WelcomeConfig>);
  }, [configRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<WelcomeConfig>) => settingsApi.updateWelcome(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['welcome', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const handleSave = (partial: Partial<WelcomeConfig>) => mutation.mutate(partial);

  const channels = (channelsRes?.data?.data ?? []) as Array<{ id: string; name: string; type: number }>;
  const textChannels = channels.filter((c) => c.type === 0);

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><MessageSquare className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <SettingsSection title={t('welcomeTitle')} description={t('welcomeDesc')}>
        <Toggle
          label={t('enableWelcome')}
          description={t('enableWelcomeDesc')}
          enabled={config.welcomeEnabled ?? false}
          onChange={(v) => { setConfig((c) => ({ ...c, welcomeEnabled: v })); handleSave({ welcomeEnabled: v }); }}
        />
        <div>
          <label className="label">{t('welcomeChannel')}</label>
          <select
            className="input"
            value={config.welcomeChannelId ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, welcomeChannelId: e.target.value || undefined }))}
            onBlur={() => handleSave({ welcomeChannelId: config.welcomeChannelId })}
          >
            <option value="">{t('selectChannel')}</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('welcomeMessage')}</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={config.welcomeMessage ?? ''}
            placeholder={t('welcomePlaceholder')}
            onChange={(e) => setConfig((c) => ({ ...c, welcomeMessage: e.target.value }))}
            onBlur={() => handleSave({ welcomeMessage: config.welcomeMessage })}
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('variables')}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('leaveTitle')} description={t('leaveDesc')}>
        <Toggle
          label={t('enableLeave')}
          description={t('enableLeaveDesc')}
          enabled={config.leaveEnabled ?? false}
          onChange={(v) => { setConfig((c) => ({ ...c, leaveEnabled: v })); handleSave({ leaveEnabled: v }); }}
        />
        <div>
          <label className="label">{t('leaveChannel')}</label>
          <select
            className="input"
            value={config.leaveChannelId ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, leaveChannelId: e.target.value || undefined }))}
            onBlur={() => handleSave({ leaveChannelId: config.leaveChannelId })}
          >
            <option value="">{t('sameAsWelcome')}</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('leaveMessage')}</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={config.leaveMessage ?? ''}
            placeholder={t('leavePlaceholder')}
            onChange={(e) => setConfig((c) => ({ ...c, leaveMessage: e.target.value }))}
            onBlur={() => handleSave({ leaveMessage: config.leaveMessage })}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
