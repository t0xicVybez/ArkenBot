'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { gameServersApi, guildsApi } from '@/lib/api';
import { Gamepad2, Radio, Bell, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type GServer = { id: string; name: string; game: string; host: string; port: number | null; history: number[] };
type Data = { installed: boolean; servers: GServer[]; monitor: { boardChannelId: string | null; alertChannelId: string | null; statChannelId: string | null } };

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-gray-500">—</span>;
  const w = 120, h = 28, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function GameServersPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const t = useTranslations('gameServersPage');

  const { data, isLoading } = useQuery({ queryKey: ['gameservers', guildId], queryFn: () => gameServersApi.get(guildId) });
  const { data: channelsRes } = useQuery({ queryKey: ['channels', guildId], queryFn: () => guildsApi.channels(guildId) });

  const d = (data?.data as { data?: Data } | undefined)?.data;
  const channels = ((channelsRes?.data as { data?: Array<{ id: string; name: string }> } | undefined)?.data ?? []);
  const chName = (id: string | null) => (id ? `#${channels.find((c) => c.id === id)?.name ?? id}` : t('none'));

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Gamepad2 className="w-5 h-5" /></div>
        <div className="min-w-0"><h1>{t('title')}</h1><div className="page-head-desc">{t('description')}</div></div>
      </div>

      {isLoading ? (
        <div className="card space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-700 rounded-sm animate-pulse" />)}</div>
      ) : !d?.installed ? (
        <div className="card text-center text-gray-400 py-8">{t('notInstalled')}</div>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-1">{t('monitorTitle')}</h2>
            <p className="text-sm text-gray-400 mb-4">{t('monitorDesc')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Radio, label: t('board'), val: chName(d.monitor.boardChannelId) },
                { icon: Bell, label: t('alerts'), val: chName(d.monitor.alertChannelId) },
                { icon: Volume2, label: t('statChannel'), val: chName(d.monitor.statChannelId) },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Icon className="w-3.5 h-3.5" />{label}</div>
                  <div className="mt-1 text-sm font-medium text-white truncate">{val}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">{t('serversTitle')}</h2>
            {d.servers.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">{t('empty')}</p>
            ) : (
              <div className="divide-y divide-(--border-subtle)">
                {d.servers.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-white truncate">{s.name}</div>
                      <div className="text-xs text-gray-500 truncate">{s.game} · {s.host}{s.port ? `:${s.port}` : ''}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Sparkline values={s.history} />
                      <span className="text-[11px] text-gray-500">{t('players', { n: s.history.at(-1) ?? 0 })}</span>
                    </div>
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
