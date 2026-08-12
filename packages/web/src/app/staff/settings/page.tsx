'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Settings, Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ACTIVITY_TYPES = ['Playing', 'Listening', 'Watching', 'Competing', 'Custom'] as const;
const STATUSES = [
  { value: 'online', emoji: '🟢' },
  { value: 'idle', emoji: '🟡' },
  { value: 'dnd', emoji: '🔴' },
  { value: 'invisible', emoji: '⚫' },
] as const;

interface BotConfig {
  activityType: string;
  activityText: string;
  status: string;
}

export default function StaffSettingsPage() {
  const t = useTranslations('staffSettings');
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: ['bot-config'],
    queryFn: () => adminApi.getBotConfig(),
  });

  const config = (res?.data?.data ?? null) as BotConfig | null;

  const [activityType, setActivityType] = useState('Watching');
  const [activityText, setActivityText] = useState('{servers} servers');
  const [status, setStatus] = useState('online');

  useEffect(() => {
    if (config) {
      setActivityType(config.activityType);
      setActivityText(config.activityText);
      setStatus(config.status);
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: () => adminApi.updateBotConfig({ activityType, activityText, status }),
    onSuccess: () => {
      toast.success(t('presenceUpdated'));
      queryClient.invalidateQueries({ queryKey: ['bot-config'] });
    },
    onError: () => toast.error(t('presenceError')),
  });

  const preview = activityText
    .replace('{servers}', '42')
    .replace('{users}', '1,337');

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <div className="page-head">
        <div className="page-head-icon"><Settings className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Bot Presence */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">{t('presenceTitle')}</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          {t.rich('presenceDesc', {
            servers: () => <code className="bg-gray-700 px-1 rounded text-xs">{'{servers}'}</code>,
            users: () => <code className="bg-gray-700 px-1 rounded text-xs">{'{users}'}</code>,
          })}
        </p>

        {isLoading ? (
          <div className="text-gray-400">{t('loading')}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('statusLabel')}</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input w-full"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.emoji} {t(`status_${s.value}`)}</option>
                  ))}
                </select>
              </div>

              {/* Activity Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('activityTypeLabel')}</label>
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="input w-full"
                >
                  {ACTIVITY_TYPES.map((at) => (
                    <option key={at} value={at}>{t(`activity_${at}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Activity Text */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('activityTextLabel')}</label>
              <input
                type="text"
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                className="input w-full"
                placeholder="{servers} servers"
                maxLength={128}
              />
            </div>

            {/* Preview */}
            <div className="bg-gray-800/50 rounded-lg p-3 border border-[var(--border-subtle)]">
              <p className="text-xs text-gray-400 mb-1">{t('preview')}</p>
              <p className="text-white text-sm">
                <span className="text-gray-400">{activityType} </span>
                <span>{preview}</span>
              </p>
            </div>

            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? t('saving') : t('saveApply')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
