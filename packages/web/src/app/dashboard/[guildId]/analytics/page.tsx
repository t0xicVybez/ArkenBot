'use client';
/**
 * The analytics page of the guild dashboard.
 */

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '@/lib/api';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { LineChart as LineChartIcon, TrendingUp, TrendingDown, Users, MessageSquare } from 'lucide-react';

const AnalyticsCharts = dynamic(() => import('./_charts'), {
  ssr: false,
  loading: () => <div className="space-y-6">{[...Array(3)].map((_, i) => <div key={i} className="card"><ChartSkeleton height={220} /></div>)}</div>,
});
import { useTranslations } from 'next-intl';

type DailyStats = { date: string; memberCount: number; messagesCount: number; commandsCount: number; newMembers: number; leftMembers: number };
type ModDay = { date: string; ban: number; kick: number; mute: number; warn: number; other: number };
type TopMember = { userId: string; userTag: string; totalMessages: number; level: number };
type Summary = {
  currentMembers: number | null; netGrowth: number; retentionPct: number | null;
  totalMessages: number; totalCommands: number; totalJoins: number; totalLeaves: number;
  avgMessagesPerDay: number; peakDay: string | null; peakMessages: number;
};
type AnalyticsData = {
  moderationActions24h: number; newMembers24h: number; leftMembers24h: number;
  history: DailyStats[]; summary?: Summary; moderationTrend?: ModDay[]; topMembers?: TopMember[];
};

const RANGES = [7, 14, 30, 90] as const;
const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const nf = (n: number) => n.toLocaleString('en-US');

export default function AnalyticsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('analytics');
  const [days, setDays] = useState<number>(30);

  const { data: res, isLoading } = useQuery({
    queryKey: ['analytics', guildId, days],
    queryFn: () => api.get(`/guilds/${guildId}/analytics?days=${days}`),
    refetchInterval: 5 * 60 * 1000,
  });

  const data: AnalyticsData = (res?.data as { data?: AnalyticsData })?.data ?? { moderationActions24h: 0, newMembers24h: 0, leftMembers24h: 0, history: [] };
  const s = data.summary;
  const history = data.history.map((d) => ({ ...d, date: fmtDay(d.date) }));
  const modTrend = (data.moderationTrend ?? []).map((d) => ({ ...d, date: fmtDay(d.date) }));
  const topMembers = data.topMembers ?? [];

  if (isLoading) {
    return <div className="p-3 sm:p-6 space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}</div>;
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl space-y-6">
      <div className="page-head">
        <div className="page-head-icon"><LineChartIcon className="w-5 h-5" /></div>
        <div className="min-w-0"><h1>{t('title')}</h1><div className="page-head-desc">{t('description')}</div></div>
      </div>

      {}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button key={r} onClick={() => setDays(r)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${days === r ? 'bg-discord-blurple/20 border-discord-blurple text-white' : 'border-(--border-subtle) text-(--text-muted)'}`}>
            {t('rangeDays', { days: r })}
          </button>
        ))}
      </div>

      {}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={<Users className="w-4 h-4" />} label={t('sumMembers')} value={s.currentMembers != null ? nf(s.currentMembers) : '—'} />
          <SummaryCard icon={s.netGrowth >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            label={t('sumNetGrowth')} value={`${s.netGrowth >= 0 ? '+' : ''}${nf(s.netGrowth)}`} valueClass={s.netGrowth >= 0 ? 'text-green-400' : 'text-red-400'} />
          <SummaryCard icon={<Users className="w-4 h-4" />} label={t('sumRetention')} value={s.retentionPct != null ? `${s.retentionPct}%` : '—'} />
          <SummaryCard icon={<MessageSquare className="w-4 h-4" />} label={t('sumAvgMessages')} value={nf(s.avgMessagesPerDay)} />
          <SummaryCard label={t('sumTotalMessages')} value={nf(s.totalMessages)} />
          <SummaryCard label={t('sumTotalCommands')} value={nf(s.totalCommands)} />
          <SummaryCard label={t('sumJoins')} value={nf(s.totalJoins)} valueClass="text-green-400" />
          <SummaryCard label={t('sumLeaves')} value={nf(s.totalLeaves)} valueClass="text-red-400" />
        </div>
      )}

      {}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t('newMembers24h')} value={data.newMembers24h} color="text-green-400" />
        <StatCard label={t('leftMembers24h')} value={data.leftMembers24h} color="text-red-400" />
        <StatCard label={t('modActions24h')} value={data.moderationActions24h} color="text-yellow-400" />
      </div>

      {history.length === 0 ? (
        <div className="card text-center py-12 text-gray-500 text-sm">{t('empty')}</div>
      ) : (
        <AnalyticsCharts history={history} modTrend={modTrend} t={t} />
      )}

      {}
      <div className="card">
        <h3 className="text-base font-semibold text-white mb-3">{t('topMembers')}</h3>
        {topMembers.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('topMembersEmpty')}</p>
        ) : (
          <div className="space-y-1.5">
            {topMembers.map((m, i) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-right text-gray-500">{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
                  <span className="text-white truncate">{m.userTag}</span>
                  <span className="text-xs text-gray-500">· {t('topLevel', { level: m.level })}</span>
                </div>
                <span className="text-gray-400 shrink-0">{t('topMessages', { count: m.totalMessages })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="card text-center"><p className={`text-3xl font-bold ${color}`}>{value}</p><p className="text-xs text-gray-400 mt-1">{label}</p></div>;
}
function SummaryCard({ icon, label, value, valueClass }: { icon?: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="card py-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-400">{icon}{label}</div>
      <p className={`text-xl font-bold mt-1 ${valueClass ?? 'text-white'}`}>{value}</p>
    </div>
  );
}
