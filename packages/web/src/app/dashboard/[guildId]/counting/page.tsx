'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { countingApi, addonsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { Hash, RotateCcw, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function CountingPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('counting');
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: ['counting', guildId],
    queryFn:  () => countingApi.get(guildId),
  });

  const resetMutation = useMutation({
    mutationFn: () => countingApi.reset(guildId),
    onSuccess: () => {
      toast.success(t('resetSuccess'));
      queryClient.invalidateQueries({ queryKey: ['counting', guildId] });
    },
    onError: () => toast.error(t('resetError')),
  });

  const data = res?.data?.data as {
    installed: boolean;
    enabled: boolean;
    settings: { channelId?: string; allowSameUser?: boolean; resetOnFail?: boolean };
    currentCount: number;
    bestCount: number;
    lastUserId: string | null;
  } | undefined;

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(2)].map((_, i) => <div key={i} className="card h-32 bg-gray-700" />)}
        </div>
      </div>
    );
  }

  if (!data?.installed) {
    return (
      <div className="p-3 sm:p-6 max-w-3xl">
        <div className="page-head">
        <div className="page-head-icon"><Hash className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>
        <div className="card text-center py-12">
          <Hash className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">{t('notInstalled')}</p>
          <p className="text-gray-500 text-sm">
            {t.rich('notInstalledHelp', { manager: (chunks) => <span className="text-discord-blurple">{chunks}</span> })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Hash className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>

      <SettingsSection title={t('liveStatsTitle')} description={t('liveStatsDesc')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">{t('currentCount')}</p>
            <p className="text-white text-3xl font-bold">{data.currentCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-center">
            <p className="text-gray-400 text-xs mb-1 flex items-center justify-center gap-1"><Trophy className="w-3 h-3" /> {t('bestCount')}</p>
            <p className="text-yellow-400 text-3xl font-bold">{data.bestCount.toLocaleString()}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('configTitle')} description={t('configDesc')}>
        <div className="space-y-2 text-sm text-gray-400">
          {data.settings.channelId && (
            <p>{t('countingChannel')} <span className="text-white font-mono">#{data.settings.channelId}</span></p>
          )}
          <p>{t('allowSameUser')} <span className="text-white">{data.settings.allowSameUser ? t('yes') : t('no')}</span></p>
          <p>{t('resetOnFail')} <span className="text-white">{data.settings.resetOnFail !== false ? t('yes') : t('no')}</span></p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="btn-danger flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            {resetMutation.isPending ? t('resetting') : t('resetButton')}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
