'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import { FileText, Search } from 'lucide-react';

export default function StaffLogsPage() {
  const [page, setPage] = useState(1);
  const [guildId, setGuildId] = useState('');
  const [type, setType] = useState('');

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
      <div className="mb-6 flex items-center gap-3">
        <FileText className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">System Logs</h1>
          <p className="text-gray-400 text-sm">Total: {total} entries</p>
        </div>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Filter by Guild ID..."
          value={guildId}
          onChange={(e) => { setGuildId(e.target.value); setPage(1); }}
          className="input flex-1"
        />
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="input sm:w-48"
        >
          <option value="">All Types</option>
          <option value="member_join">Member Join</option>
          <option value="member_leave">Member Leave</option>
          <option value="message_delete">Message Delete</option>
          <option value="message_edit">Message Edit</option>
          <option value="member_ban">Ban</option>
          <option value="member_kick">Kick</option>
          <option value="member_warn">Warning</option>
          <option value="automod">AutoMod</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="divide-y divide-gray-700/50 font-mono text-sm">
          {isLoading ? (
            [...Array(20)].map((_, i) => (
              <div key={i} className="px-4 py-2 animate-pulse">
                <div className="h-3 bg-gray-700 rounded w-full" />
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">No logs found</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 hover:bg-discord-dark-bg/30 flex items-center gap-3">
                <span className="text-gray-600 text-xs w-20 flex-shrink-0">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span className={`text-xs w-28 flex-shrink-0 ${typeColors[log.type] ?? 'text-gray-400'}`}>
                  {log.type}
                </span>
                <span className="text-gray-500 text-xs w-20 flex-shrink-0 truncate">
                  {log.guildId.slice(-6)}
                </span>
                <span className="text-gray-300 text-xs truncate">
                  {JSON.stringify(log.data).slice(0, 100)}
                </span>
              </div>
            ))
          )}
        </div>

        {total > 100 && (
          <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-between">
            <p className="text-xs text-gray-400">Page {page} of {Math.ceil(total / 100)}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs py-1 px-3">
                Previous
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="btn-secondary text-xs py-1 px-3">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
