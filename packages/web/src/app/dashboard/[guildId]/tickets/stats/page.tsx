'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { ticketsApi } from '@/lib/api';
import { TrendingUp, Ticket, Star, Users, Clock, AlertTriangle, CheckCircle, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatsData {
  total: number; open: number; claimed: number; closed: number; waiting: number;
  avgRating: number | null; avgResponseMinutes: number | null; avgCloseMinutes: number | null;
  recentlyClosed: number; slaBreaches: number; panels: number; blacklistedUsers: number;
  ratingDistribution: Record<number, number>;
  byPanel: {
    panelId: string; panelName: string; emoji: string; total: number; open: number;
    avgRating: number | null; avgCloseMinutes: number | null;
  }[];
}
interface TimeseriesPoint { date: string; opened: number; closed: number; }

const CHART_COLORS = ['#5865f2', '#57f287', '#fee75c', '#ed4245', '#eb459e', '#00aff4'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-gray-300 mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketStatsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('ticketStatsPage');
  const [days, setDays] = useState(30);

  const { data: statsRes } = useQuery({
    queryKey: ['tickets-stats', guildId],
    queryFn: () => ticketsApi.getStats(guildId),
  });

  const { data: tsRes, isLoading: tsLoading } = useQuery({
    queryKey: ['tickets-timeseries', guildId, days],
    queryFn: () => ticketsApi.getTimeseries(guildId, days),
  });

  const stats  = statsRes?.data?.data as StatsData | undefined;
  const tsData = (tsRes?.data?.data ?? []) as TimeseriesPoint[];

  // Condense dates for readability when viewing 90+ days
  const chartData = days > 60
    ? tsData.filter((_, i) => i % 7 === 0)
    : tsData;

  // Pie data: status breakdown
  const pieStatus = stats
    ? [
        { name: t('statusOpen'),    value: stats.open,    color: '#57f287' },
        { name: t('statusClaimed'), value: stats.claimed, color: '#5865f2' },
        { name: t('statusWaiting'), value: stats.waiting, color: '#fee75c' },
        { name: t('statusClosed'),  value: stats.closed,  color: '#ed4245' },
      ].filter((d) => d.value > 0)
    : [];

  // Pie data: per-panel breakdown
  const piePanel = (stats?.byPanel ?? [])
    .filter((p) => p.total > 0)
    .map((p, i) => ({ name: `${p.emoji} ${p.panelName}`, value: p.total, color: CHART_COLORS[i % CHART_COLORS.length] }));

  // Rating distribution bar data
  const ratingData = stats
    ? [1, 2, 3, 4, 5].map((n) => ({ star: `${n}★`, count: stats.ratingDistribution[n] ?? 0 }))
    : [];

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/${guildId}/tickets`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-discord-blurple" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
            <p className="text-gray-400 text-sm">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Summary cards — row 1 */}
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={<Ticket className="w-5 h-5 text-discord-blurple" />}   label={t('totalTickets')}   value={stats.total} />
            <StatCard icon={<div className="w-3 h-3 rounded-full bg-green-400" />} label={t('statusOpen')}            value={stats.open} />
            <StatCard icon={<div className="w-3 h-3 rounded-full bg-yellow-400" />} label={t('statusWaiting')}        value={stats.waiting} />
            <StatCard icon={<div className="w-3 h-3 rounded-full bg-red-400" />}   label={t('statusClosed')}          value={stats.closed} />
          </div>
          {/* Summary cards — row 2 */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={<Star className="w-5 h-5 text-yellow-400" />}           label={t('avgRating')}       value={stats.avgRating != null ? `${stats.avgRating.toFixed(1)} / 5` : '—'} />
            <StatCard icon={<Clock className="w-5 h-5 text-blue-400" />}            label={t('avgResponse')}     value={fmtMinutes(stats.avgResponseMinutes)} />
            <StatCard icon={<CheckCircle className="w-5 h-5 text-green-400" />}     label={t('avgCloseTime')}   value={fmtMinutes(stats.avgCloseMinutes)} />
            <StatCard icon={<AlertTriangle className="w-5 h-5 text-red-400" />}     label={t('slaBreaches')}     value={stats.slaBreaches} accent={stats.slaBreaches > 0 ? 'red' : undefined} />
          </div>
          {/* Row 3: extra context */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={<Hourglass className="w-5 h-5 text-purple-400" />}      label={t('statusClaimed')}          value={stats.claimed} />
            <StatCard icon={<TrendingUp className="w-5 h-5 text-green-400" />}      label={t('closed7days')}  value={stats.recentlyClosed} />
            <StatCard icon={<Users className="w-5 h-5 text-gray-400" />}            label={t('panels')}           value={stats.panels} />
            <StatCard icon={<Users className="w-5 h-5 text-red-400" />}             label={t('blacklisted')}      value={stats.blacklistedUsers} />
          </div>
        </>
      )}

      {/* Time-series bar chart */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-white font-semibold">{t('ticketsOverTime')}</h2>
          <div className="flex gap-2 flex-wrap">
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  days === d ? 'bg-discord-blurple text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {d === 365 ? t('year') : `${d}d`}
              </button>
            ))}
          </div>
        </div>

        {tsLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">{t('loading')}</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-500">{t('noDataYet')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
              />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Bar dataKey="opened" name={t('opened')} fill="#5865f2" radius={[3, 3, 0, 0]} />
              <Bar dataKey="closed" name={t('statusClosed')}  fill="#57f287" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pie charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="card space-y-4">
          <h2 className="text-white font-semibold">{t('statusBreakdown')}</h2>
          {pieStatus.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500">{t('noTicketData')}</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
                    {pieStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {pieStatus.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                      <span className="text-gray-300 text-sm">{item.name}</span>
                    </div>
                    <span className="text-white font-semibold text-sm">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Per-panel breakdown */}
        <div className="card space-y-4">
          <h2 className="text-white font-semibold">{t('byPanel')}</h2>
          {piePanel.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500">{t('noPanelData')}</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={piePanel} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
                    {piePanel.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1 min-w-0">
                {piePanel.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="text-gray-300 text-sm truncate">{item.name}</span>
                    </div>
                    <span className="text-white font-semibold text-sm flex-shrink-0">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rating distribution */}
      {stats && Object.values(stats.ratingDistribution).some((v) => v > 0) && (
        <div className="card space-y-4">
          <h2 className="text-white font-semibold">{t('ratingDistribution')}</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ratingData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="star" tick={{ fill: '#9ca3af', fontSize: 13 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('ratings')} fill="#fee75c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-panel table */}
      {stats && stats.byPanel.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-white font-semibold">{t('panelDetails')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">{t('colPanel')}</th>
                  <th className="px-4 py-3">{t('colTotal')}</th>
                  <th className="px-4 py-3">{t('statusOpen')}</th>
                  <th className="px-4 py-3">{t('statusClosed')}</th>
                  <th className="px-4 py-3">{t('colAvgRating')}</th>
                  <th className="px-4 py-3">{t('colAvgClose')}</th>
                  <th className="px-4 py-3">{t('colCloseRate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {stats.byPanel.map((p) => {
                  const closedCount = p.total - p.open;
                  const rate = p.total > 0 ? Math.round((closedCount / p.total) * 100) : 0;
                  return (
                    <tr key={p.panelId} className="hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-3 text-white text-sm whitespace-nowrap">{p.emoji} {p.panelName}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{p.total}</td>
                      <td className="px-4 py-3"><span className="badge-success text-xs">{p.open}</span></td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{closedCount}</td>
                      <td className="px-4 py-3 text-sm">
                        {p.avgRating != null
                          ? <span className="text-yellow-400">{'⭐'.repeat(Math.round(p.avgRating))} <span className="text-gray-400">({p.avgRating.toFixed(1)})</span></span>
                          : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{fmtMinutes(p.avgCloseMinutes)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-[60px] max-w-[80px]">
                            <div className="bg-discord-blurple h-1.5 rounded-full" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-gray-400 text-xs whitespace-nowrap">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, accent,
}: {
  icon: React.ReactNode; label: string; value: string | number; accent?: 'red';
}) {
  return (
    <div className="card flex items-center gap-3 py-3">
      {icon}
      <div className="min-w-0">
        <p className="text-gray-400 text-xs truncate">{label}</p>
        <p className={`font-bold text-lg sm:text-xl truncate ${accent === 'red' ? 'text-red-400' : 'text-white'}`}>{value}</p>
      </div>
    </div>
  );
}
