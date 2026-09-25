'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { gameAdminApi, guildsApi } from '@/lib/api';
import { Terminal, ScrollText, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

type GServer = { id: string; name: string; game: string; host: string; port: number };
type GSchedule = { id: string; action: string; serverName: string; intervalMs: number; nextRun: number; message: string | null };
type Data = { installed: boolean; servers: GServer[]; logChannelId: string | null; schedules: GSchedule[] };

const INTERVAL_KEY: Record<number, string> = { 3600000: 'hourly', 21600000: 'every6h', 43200000: 'every12h', 86400000: 'daily' };

export default function GameAdminPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const t = useTranslations('gameAdminPage');

  const { data, isLoading } = useQuery({ queryKey: ['gameadmin', guildId], queryFn: () => gameAdminApi.get(guildId) });
  const { data: channelsRes } = useQuery({ queryKey: ['channels', guildId], queryFn: () => guildsApi.channels(guildId) });

  const d = (data?.data as { data?: Data } | undefined)?.data;
  const channels = ((channelsRes?.data as { data?: Array<{ id: string; name: string }> } | undefined)?.data ?? []);
  const chName = (id: string | null) => (id ? `#${channels.find((c) => c.id === id)?.name ?? id}` : t('none'));

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Terminal className="w-5 h-5" /></div>
        <div className="min-w-0"><h1>{t('title')}</h1><div className="page-head-desc">{t('description')}</div></div>
      </div>

      {isLoading ? (
        <div className="card space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-700 rounded-sm animate-pulse" />)}</div>
      ) : !d?.installed ? (
        <div className="card text-center text-gray-400 py-8">{t('notInstalled')}</div>
      ) : (
        <div className="space-y-6">
          <div className="card flex items-center gap-3">
            <ScrollText className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{t('auditTitle')}</div>
              <div className="text-xs text-gray-500">{t('auditChannel', { channel: chName(d.logChannelId) })}</div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">{t('serversTitle')}</h2>
            {d.servers.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">{t('empty')}</p>
            ) : (
              <div className="divide-y divide-(--border-subtle)">
                {d.servers.map((s) => (
                  <div key={s.id} className="py-3">
                    <div className="font-medium text-white">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.game} · {s.host}:{s.port}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4"><Clock className="w-5 h-5 text-gray-400" /><h2 className="text-lg font-semibold text-white">{t('schedulesTitle')}</h2></div>
            {d.schedules.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">{t('schedulesEmpty')}</p>
            ) : (
              <div className="divide-y divide-(--border-subtle)">
                {d.schedules.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3 text-sm">
                    <span className="font-medium text-white">{t(`action.${s.action}`)}</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-300">{s.serverName}</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-400">{t(`every.${INTERVAL_KEY[s.intervalMs] ?? 'hourly'}`)}</span>
                    <span className="ml-auto text-xs text-gray-500">{t('next')} {new Date(s.nextRun).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
