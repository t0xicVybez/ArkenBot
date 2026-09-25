'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function StaffLogsPage() {
  const t = useTranslations('staffLogs');
  const [page, setPage] = useState(1);
  const [guildId, setGuildId] = useState('');
  const [type, setType] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: logsRes, isLoading } = useQuery({
    queryKey: ['admin-logs', page, guildId, type],
    queryFn: () => adminApi.getLogs({ page, guildId: guildId || undefined, type: type || undefined }),
    refetchInterval: 30000,
  });

  const logs = (logsRes?.data?.data?.items ?? []) as Array<{
    id: string; guildId: string; type: string; userId?: string; data: object; createdAt: string;
  }>;
  const total = logsRes?.data?.data?.total ?? 0;
  const hasMore = logsRes?.data?.data?.hasMore ?? false;

  const typeColors: Record<string, string> = {
    member_join: 'text-green-400',
    member_leave: 'text-red-400',
    message_delete: 'text-red-400',
    message_edit: 'text-yellow-400',
    member_ban: 'text-red-400',
    member_kick: 'text-orange-400',
    member_warn: 'text-yellow-400',
    automod: 'text-purple-400',
  };

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><FileText className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('total', { total })}</div>
        </div>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder={t('filterGuild')}
          value={guildId}
          onChange={(e) => { setGuildId(e.target.value); setPage(1); }}
          className="input flex-1"
        />
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="input sm:w-48"
        >
          <option value="">{t('allTypes')}</option>
          <option value="member_join">{t('typeMemberJoin')}</option>
          <option value="member_leave">{t('typeMemberLeave')}</option>
          <option value="message_delete">{t('typeMessageDelete')}</option>
          <option value="message_edit">{t('typeMessageEdit')}</option>
          <option value="member_ban">{t('typeBan')}</option>
          <option value="member_kick">{t('typeKick')}</option>
          <option value="member_warn">{t('typeWarning')}</option>
          <option value="automod">{t('typeAutomod')}</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="divide-y divide-(--border-subtle) font-mono text-sm">
          {isLoading ? (
            [...Array(20)].map((_, i) => (
              <div key={i} className="px-4 py-2 animate-pulse">
                <div className="h-3 bg-gray-700 rounded-sm w-full" />
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">{t('noLogs')}</div>
          ) : (
            logs.map((log) => {
              const isOpen = expanded === log.id;
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  className="w-full px-4 py-2.5 text-left hover:bg-white/2"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-gray-600 text-xs w-20 flex-shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs w-28 flex-shrink-0 ${typeColors[log.type] ?? 'text-gray-400'}`}>
                        {log.type}
                      </span>
                      <span className="text-gray-500 text-xs w-16 flex-shrink-0 truncate">
                        {log.guildId.slice(-6)}
                      </span>
                    </div>
                    {!isOpen && (
                      <span className="text-gray-300 text-xs break-all sm:truncate min-w-0">
                        {JSON.stringify(log.data)}
                      </span>
                    )}
                  </div>
                  {isOpen && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-black/30 p-3 text-[11px] leading-relaxed text-gray-300">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </button>
              );
            })
          )}
        </div>

        {total > 100 && (
          <div className="px-4 py-3 border-t border-(--border-subtle) flex items-center justify-between">
            <p className="text-xs text-gray-400">{t('pageOf', { page, pages: Math.ceil(total / 100) })}</p>
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
