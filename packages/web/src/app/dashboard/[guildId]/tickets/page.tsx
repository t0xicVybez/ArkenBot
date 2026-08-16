'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ticketsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Ticket, LayoutTemplate, ChevronRight, BarChart2, Trash2, MessageSquare, AlertTriangle, Clock, Settings } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketRecord {
  id: string; number: number; userId: string; username: string;
  status: 'open' | 'claimed' | 'closed'; priority: 'low' | 'medium' | 'high' | 'urgent';
  panelId: string; categoryTag?: string; tags: string[];
  claimedByTag?: string; closedAt?: string; rating?: number; createdAt: string;
  firstResponseAt?: string; lastActivity: string;
}

interface StatsData {
  total: number; open: number; claimed: number; closed: number;
  avgRating: number | null; avgResponseMinutes: number | null;
  slaBreaches: number; recentlyClosed: number; panels: number;
  byPanel: { panelId: string; panelName: string; emoji: string; total: number; open: number }[];
}

const PRIORITY_DOT = { low: 'bg-green-400', medium: 'bg-yellow-400', high: 'bg-orange-400', urgent: 'bg-red-400' };
const STATUS_BADGE  = { open: 'badge-success', claimed: 'badge-info', closed: 'badge-secondary' };
const PIE_COLORS    = ['#57f287', '#5865f2', '#ed4245'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('ticketsPage');
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter]     = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch]                 = useState('');
  const [page, setPage]                     = useState(1);
  const [bulkCloseHours, setBulkCloseHours] = useState(72);
  const [showBulkClose, setShowBulkClose]   = useState(false);

  const { data: statsRes }   = useQuery({ queryKey: ['tickets-stats', guildId], queryFn: () => ticketsApi.getStats(guildId) });
  const { data: configRes }  = useQuery({ queryKey: ['tickets-config', guildId], queryFn: () => ticketsApi.getConfig(guildId) });
  const slaHours = (configRes?.data?.data as { slaHours?: number } | undefined)?.slaHours ?? 24;
  const { data: ticketsRes, isLoading } = useQuery({
    queryKey: ['tickets-list', guildId, statusFilter, priorityFilter, search, page],
    queryFn: () => ticketsApi.getTickets(guildId, { status: statusFilter, priority: priorityFilter, search, page }),
  });

  const bulkCloseMut = useMutation({
    mutationFn: () => ticketsApi.bulkClose(guildId, bulkCloseHours),
    onSuccess: (res) => {
      const count = (res.data as { data?: { closedCount?: number } })?.data?.closedCount ?? 0;
      toast.success(t('closedIdle', { count }));
      setShowBulkClose(false);
      queryClient.invalidateQueries({ queryKey: ['tickets-list', guildId] });
      queryClient.invalidateQueries({ queryKey: ['tickets-stats', guildId] });
    },
  });

  const stats   = statsRes?.data?.data as StatsData | undefined;
  const tickets = (ticketsRes?.data?.data ?? []) as TicketRecord[];
  const meta    = ticketsRes?.data?.meta as { total: number; page: number; limit: number } | undefined;

  const pieData = stats
    ? [
        { name: t('status_open'),    value: stats.open,    color: '#57f287' },
        { name: t('status_claimed'), value: stats.claimed, color: '#5865f2' },
        { name: t('status_closed'),  value: stats.closed,  color: '#ed4245' },
      ].filter((d) => d.value > 0)
    : [];

  const isSlaWarning = (row: TicketRecord) => {
    if (row.status === 'closed' || row.firstResponseAt || slaHours === 0) return false;
    const openMs = Date.now() - new Date(row.createdAt).getTime();
    return openMs >= slaHours * 60 * 60 * 1000;
  };

  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Ticket className="w-6 h-6 text-discord-blurple" />
          <div>
            <h1 className="text-[21px] font-bold tracking-tight text-white">{t('title')}</h1>
            <p className="text-gray-400 text-sm">{t('totalTickets', { count: stats?.total ?? 0 })}</p>
          </div>
          {stats && stats.slaBreaches > 0 && (
            <span className="badge-warning flex items-center gap-1 text-xs">
              <AlertTriangle className="w-3 h-3" />
              {t('slaBreaches', { count: stats.slaBreaches })}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowBulkClose((v) => !v)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Trash2 className="w-4 h-4" /> {t('bulkClose')}
          </button>
          <Link href={`/dashboard/${guildId}/tickets/canned-responses`} className="btn-secondary flex items-center gap-2 text-sm">
            <MessageSquare className="w-4 h-4" /> {t('cannedResponses')}
          </Link>
          <Link href={`/dashboard/${guildId}/tickets/stats`} className="btn-secondary flex items-center gap-2 text-sm">
            <BarChart2 className="w-4 h-4" /> {t('statistics')}
          </Link>
          <Link href={`/dashboard/${guildId}/tickets/panels`} className="btn-secondary flex items-center gap-2 text-sm">
            <LayoutTemplate className="w-4 h-4" /> {t('panels')}
          </Link>
          <Link href={`/dashboard/${guildId}/tickets/settings`} className="btn-secondary flex items-center gap-2 text-sm">
            <Settings className="w-4 h-4" /> {t('settings')}
          </Link>
        </div>
      </div>

      {showBulkClose && (
        <div className="card border border-yellow-500/30 bg-yellow-500/5 space-y-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-yellow-400" /> {t('bulkTitle')}
          </h3>
          <p className="text-gray-400 text-sm">
            {t('bulkDesc')}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-gray-400 text-sm">{t('idleLongerThan')}</label>
            <input
              type="number"
              min={1}
              value={bulkCloseHours}
              onChange={(e) => setBulkCloseHours(parseInt(e.target.value, 10) || 72)}
              className="input w-24"
            />
            <span className="text-gray-400 text-sm">{t('hours')}</span>
            <button
              onClick={() => bulkCloseMut.mutate()}
              disabled={bulkCloseMut.isPending}
              className="btn-danger text-sm"
            >
              {bulkCloseMut.isPending ? t('closing') : t('closeTickets')}
            </button>
            <button onClick={() => setShowBulkClose(false)} className="btn-secondary text-sm">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card space-y-2">
          <h2 className="text-gray-400 text-xs uppercase tracking-wider font-medium">{t('serverTickets')}</h2>
          {stats && stats.total > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} dataKey="value" strokeWidth={0}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-gray-300 text-xs">{d.name}</span>
                    <span className="text-white font-semibold text-xs ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-600 text-sm">{t('noDataYet')}</div>
          )}
        </div>

        {/* Panel breakdown */}
        <div className="card space-y-2">
          <h2 className="text-gray-400 text-xs uppercase tracking-wider font-medium">{t('ticketPanels', { count: stats?.panels ?? 0 })}</h2>
          {stats && stats.byPanel.length > 0 ? (
            <div className="space-y-2">
              {stats.byPanel.slice(0, 4).map((p, i) => (
                <div key={p.panelId} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-300 text-xs flex-1 truncate">{p.emoji} {p.panelName}</span>
                  <span className="text-white font-semibold text-xs">{p.total}</span>
                  {p.open > 0 && <span className="badge-success text-xs">{p.open} open</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-600 text-sm">
              <Link href={`/dashboard/${guildId}/tickets/panels`} className="text-discord-blurple hover:underline">
                {t('createFirstPanel')}
              </Link>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="text-gray-400 text-xs uppercase tracking-wider font-medium">{t('quickStats')}</h2>
          <div className="space-y-2">
            <StatRow label={t('openTickets')}     value={stats?.open ?? 0}              color="text-green-400" />
            <StatRow label={t('claimedTickets')}  value={stats?.claimed ?? 0}           color="text-blue-400" />
            <StatRow label={t('closed7d')}      value={stats?.recentlyClosed ?? 0}    color="text-gray-300" />
            <StatRow label={t('avgSatisfaction')} value={stats?.avgRating != null ? `${stats.avgRating.toFixed(1)} ⭐` : '—'} color="text-yellow-400" />
            <StatRow label={t('avgResponse')}     value={stats?.avgResponseMinutes != null ? formatMinutes(stats.avgResponseMinutes) : '—'} color="text-purple-400" />
            {(stats?.slaBreaches ?? 0) > 0 && (
              <StatRow label={t('slaBreachesLabel')} value={stats!.slaBreaches} color="text-red-400" />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-white font-semibold">{t('ticketHistory')}</h2>
        <div className="flex flex-wrap gap-3">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select className="input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">{t('allStatuses')}</option>
            <option value="open">{t('status_open')}</option>
            <option value="claimed">{t('status_claimed')}</option>
            <option value="closed">{t('status_closed')}</option>
          </select>
          <select className="input" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}>
            <option value="">{t('allPriorities')}</option>
            <option value="low">{t('priority_low')}</option>
            <option value="medium">{t('priority_medium')}</option>
            <option value="high">{t('priority_high')}</option>
            <option value="urgent">{t('priority_urgent')}</option>
          </select>
        </div>

        <div className="card overflow-hidden p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">{t('loading')}</div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center">
              <Ticket className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">{t('noTicketsFound')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="border-b border-[var(--border-subtle)] text-left text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">{t('colUsername')}</th>
                  <th className="px-4 py-3">{t('colCategory')}</th>
                  <th className="px-4 py-3">{t('colStatus')}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{t('colPriority')}</th>
                  <th className="px-4 py-3 hidden lg:table-cell">{t('colCreated')}</th>
                  <th className="px-4 py-3 hidden lg:table-cell">{t('colRating')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {tickets.map((row) => {
                  const dotClass = PRIORITY_DOT[row.priority] ?? PRIORITY_DOT.medium;
                  const badge    = STATUS_BADGE[row.status]  ?? 'badge-secondary';
                  const slaWarn  = isSlaWarning(row);
                  return (
                    <tr key={row.id} className={`hover:bg-gray-700/20 transition-colors ${slaWarn ? 'border-l-2 border-l-yellow-500' : ''}`}>
                      <td className="px-4 py-3 text-gray-300 font-mono text-sm">
                        <span>#{row.number}</span>
                        {slaWarn && <AlertTriangle className="w-3 h-3 text-yellow-400 inline ml-1" aria-label={t('noStaffResponse')} />}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{row.username}</p>
                        {row.claimedByTag && <p className="text-gray-500 text-xs">→ {row.claimedByTag}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {row.categoryTag
                          ? <span className="badge-info text-xs">{row.categoryTag}</span>
                          : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${badge} text-xs`}>
                          {t(`status_${row.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                          <span className="text-gray-400 text-xs">{t(`priority_${row.priority}`)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-400 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(row.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-yellow-400 text-xs">
                        {row.rating ? '⭐'.repeat(row.rating) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/${guildId}/tickets/${row.id}`} className="text-discord-blurple hover:text-blue-400 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {meta && meta.total > meta.limit && (
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{t('showing', { from: (meta.page - 1) * meta.limit + 1, to: Math.min(meta.page * meta.limit, meta.total), total: meta.total })}</span>
            <div className="flex gap-2">
              <button className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40" disabled={meta.page <= 1} onClick={() => setPage((p) => p - 1)}>{t('previous')}</button>
              <button className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40" disabled={meta.page * meta.limit >= meta.total} onClick={() => setPage((p) => p + 1)}>{t('next')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`font-semibold text-sm ${color}`}>{value}</span>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return `${h}h ${m}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
