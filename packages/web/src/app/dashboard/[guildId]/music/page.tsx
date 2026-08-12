'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import type { GuildSettings } from '@arkenbot/shared';
import { Music } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function MusicPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('music');
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<GuildSettings>>({});

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
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

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Music className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>

      <SettingsSection title={t('playerTitle')} description={t('playerDesc')}>
        <Toggle
          label={t('enableLabel')}
          description={t('enableDesc')}
          enabled={settings.musicEnabled ?? true}
          onChange={(v) => { setSettings((s) => ({ ...s, musicEnabled: v })); handleSave({ musicEnabled: v }); }}
        />
      </SettingsSection>

      <SettingsSection title={t('howToTitle')} description={t('howToDesc')}>
        <div className="space-y-2 text-sm text-gray-400">
          {[
            ['/play <url or search>', t('cmdPlay')],
            ['/skip', t('cmdSkip')],
            ['/queue', t('cmdQueue')],
            ['/pause / /resume', t('cmdPause')],
            ['/volume <1-100>', t('cmdVolume')],
            ['/stop', t('cmdStop')],
            ['/nowplaying', t('cmdNowplaying')],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-3">
              <code className="text-discord-blurple font-mono w-52 flex-shrink-0">{cmd}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
