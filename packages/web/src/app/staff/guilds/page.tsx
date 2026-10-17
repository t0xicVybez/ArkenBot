'use client';
/**
 * Staff portal: the guilds page.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Search, Server, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWebSocket } from '@/lib/socket';

// An inactive guild's data is permanently purged this long after the bot
// leaves. Must match PURGE_GRACE_HOURS in packages/bot/src/utils/guildPurge.ts.
const RETENTION_MS = 72 * 60 * 60 * 1000;

function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function StaffGuildsPage() {
  const t = useTranslations('staffGuilds');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('');

  // Tick every minute so the deletion countdown stays current without a refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: guildsRes, isLoading } = useQuery({
    queryKey: ['admin-guilds', page, search, activeFilter],
    queryFn: () => adminApi.getGuilds({ page, search: search || undefined, active: activeFilter || undefined }),
  });

  useWebSocket('guild:joined', () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }));
  useWebSocket('guild:left', () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }));

  const deleteGuildMutation = useMutation({
    mutationFn: (guildId: string) => adminApi.deleteGuild(guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }),
  });

  const guilds = (guildsRes?.data?.data?.items ?? []) as Array<{
    id: string;
    name: string;
    iconUrl?: string;
    ownerId: string;
    memberCount: number | null;
    isActive: boolean;
    joinedAt: string;
    leftAt?: string | null;
  }>;
  const total = guildsRes?.data?.data?.total ?? 0;
  const hasMore = guildsRes?.data?.data?.hasMore ?? false;

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('total', { total })}</div>
        </div>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          className="input sm:w-40"
        >
          <option value="">{t('allStatus')}</option>
          <option value="true">{t('active')}</option>
          <option value="false">{t('inactive')}</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-(--bg-base)">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colGuild')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colId')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colStatus')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colJoined')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase" title={t('retentionHelp')}>{t('colRetention')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border-subtle)">
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded-sm" />
                  </td>
                </tr>
              ))
            ) : guilds.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {t('noGuilds')}
                </td>
              </tr>
            ) : (
              guilds.map((guild) => (
                <tr key={guild.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {guild.iconUrl ? (
                        <img src={guild.iconUrl} alt={guild.name} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-discord-blurple flex items-center justify-center text-white text-xs font-bold">
                          {guild.name[0]}
                        </div>
                      )}
                      <span className="text-sm text-white font-medium">{guild.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">{guild.id}</td>
                  <td className="px-4 py-3">
                    <span className={guild.isActive ? 'badge-success' : 'badge-danger'}>
                      {guild.isActive ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(guild.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {guild.isActive || !guild.leftAt ? (
                      <span className="text-gray-600">—</span>
                    ) : (
                      (() => {
                        const left = new Date(guild.leftAt);
                        const remaining = left.getTime() + RETENTION_MS - now;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-400">{t('leftOn', { date: left.toLocaleDateString() })}</span>
                            {remaining > 0 ? (
                              <span className="text-xs text-amber-400">{t('deletesIn', { time: formatRemaining(remaining) })}</span>
                            ) : (
                              <span className="text-xs text-red-400">{t('deletionPending')}</span>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/${guild.id}`}
                        className="text-discord-blurple hover:text-blue-400 transition-colors text-sm flex items-center gap-1"
                      >
                        {t('view')} <ExternalLink className="w-3 h-3" />
                      </Link>
                      {!guild.isActive && (
                        <button
                          type="button"
                          disabled={deleteGuildMutation.isPending}
                          onClick={() => {
                            if (!window.confirm(t('deleteConfirm', { name: guild.name }))) {
                              return;
                            }
                            deleteGuildMutation.mutate(guild.id);
                          }}
                          className="btn-danger text-xs py-1 px-2 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          {t('delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {total > 20 && (
          <div className="px-4 py-3 border-t border-(--border-subtle) flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {t('pageInfo', { page, total })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs py-1 px-3">
                {t('previous')}
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="btn-secondary text-xs py-1 px-3">
                {t('next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
