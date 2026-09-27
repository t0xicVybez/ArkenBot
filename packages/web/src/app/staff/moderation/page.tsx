'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import { Search, Gavel, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type ModCase = {
  id: string; caseNumber: number; guildId: string; type: string; userId: string;
  userTag: string; moderatorTag: string; reason: string; active: boolean; createdAt: string;
  guild?: { name: string } | null;
};
type ModWarn = Omit<ModCase, 'caseNumber' | 'type'>;

const CASE_TYPES = ['ban', 'kick', 'mute', 'timeout', 'warn', 'unban', 'unmute'];

export default function StaffModerationPage() {
  const t = useTranslations('staffModeration');
  const [tab, setTab] = useState<'cases' | 'warnings'>('cases');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [active, setActive] = useState('');

  const isCases = tab === 'cases';
  const { data, isLoading } = useQuery({
    queryKey: ['admin-moderation', tab, page, search, type, active],
    queryFn: () =>
      isCases
        ? adminApi.getModerationCases({ page, search: search || undefined, type: type || undefined, active: active || undefined })
        : adminApi.getModerationWarnings({ page, search: search || undefined, active: active || undefined }),
  });

  const items = ((data?.data as { data?: { items?: (ModCase | ModWarn)[] } } | undefined)?.data?.items ?? []) as (ModCase | ModWarn)[];
  const meta = (data?.data as { data?: { total?: number; hasMore?: boolean } } | undefined)?.data;
  const total = meta?.total ?? 0;
  const hasMore = meta?.hasMore ?? false;

  const switchTab = (nt: 'cases' | 'warnings') => { setTab(nt); setPage(1); setSearch(''); setType(''); setActive(''); };

  const typeBadge = (ty: string) => {
    const cls = ['ban', 'kick'].includes(ty) ? 'badge-danger' : ['mute', 'warn', 'timeout'].includes(ty) ? 'badge-warning' : 'badge-success';
    return <span className={cls}>{ty}</span>;
  };

  const cols = isCases ? 8 : 6;

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('total', { total })}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => switchTab('cases')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isCases ? 'bg-discord-blurple text-white' : 'bg-(--bg-card) text-gray-400 hover:text-white'}`}>
          <Gavel className="w-4 h-4" /> {t('tabCases')}
        </button>
        <button onClick={() => switchTab('warnings')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!isCases ? 'bg-discord-blurple text-white' : 'bg-(--bg-card) text-gray-400 hover:text-white'}`}>
          <ShieldAlert className="w-4 h-4" /> {t('tabWarnings')}
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder={t('searchPlaceholder')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" />
        </div>
        {isCases && (
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="input sm:w-40">
            <option value="">{t('allTypes')}</option>
            {CASE_TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
          </select>
        )}
        <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} className="input sm:w-44">
          <option value="">{t('allStatus')}</option>
          <option value="true">{t('statusActive')}</option>
          <option value="false">{t('statusInactive')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-(--bg-base)">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colServer')}</th>
                {isCases && <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colCase')}</th>}
                {isCases && <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colType')}</th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colUser')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colReason')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colModerator')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colDate')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={cols} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded-sm" /></td></tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={cols} className="px-4 py-8 text-center text-gray-500">{isCases ? t('noCases') : t('noWarnings')}</td></tr>
              ) : (
                items.map((it) => {
                  const c = it as ModCase;
                  return (
                    <tr key={it.id} className="hover:bg-white/2 transition-colors align-top">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/${it.guildId}/moderation`} className="text-sm text-white font-medium hover:text-discord-blurple">
                          {it.guild?.name ?? it.guildId}
                        </Link>
                      </td>
                      {isCases && <td className="px-4 py-3 text-sm text-gray-400 font-mono">#{c.caseNumber}</td>}
                      {isCases && <td className="px-4 py-3">{typeBadge(c.type)}</td>}
                      <td className="px-4 py-3">
                        <div className="text-sm text-white">{it.userTag || '—'}</div>
                        <div className="text-xs text-gray-500 font-mono">{it.userId}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-[280px] truncate" title={it.reason}>{it.reason}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{it.moderatorTag || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(it.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3"><span className={it.active ? 'badge-warning' : 'badge-success'}>{it.active ? t('statusActive') : t('statusInactive')}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 25 && (
          <div className="px-4 py-3 border-t border-(--border-subtle) flex items-center justify-between">
            <p className="text-xs text-gray-400">{t('pageInfo', { page, total })}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs py-1 px-3">{t('previous')}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="btn-secondary text-xs py-1 px-3">{t('next')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
