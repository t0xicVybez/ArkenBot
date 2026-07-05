'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auditLogApi } from '@/lib/api';
import { useState } from 'react';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';

type AuditEntry = {
  id: string;
  userId: string;
  username: string | null;
  method: string;
  path: string;
  section: string;
  createdAt: string;
};

const METHOD_STYLES: Record<string, string> = {
  POST:   'bg-green-500/15 text-green-400 border-green-500/30',
  PATCH:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const METHOD_VERBS: Record<string, string> = {
  POST: 'Created',
  PATCH: 'Updated',
  DELETE: 'Deleted',
};

/** "trello-alerts" → "Trello Alerts" */
function humanizeSection(section: string): string {
  return section
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function AuditLogPage() {
  const { guildId } = useParams() as { guildId: string };
  const [page, setPage] = useState(1);

  const { data: res, isLoading } = useQuery({
    queryKey: ['audit-log', guildId, page],
    queryFn: () => auditLogApi.list(guildId, page),
  });

  const data = (res?.data as { data?: { entries: AuditEntry[]; total: number; pages: number } })?.data;
  const entries = data?.entries ?? [];
  const pages = data?.pages ?? 1;

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <History className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Audit Log</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Every change made to this server&apos;s settings through the web dashboard — who, what, and when.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No dashboard changes recorded yet. Entries appear here whenever an admin saves settings, creates alerts, or deletes configuration through the dashboard.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-700/50">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="bg-discord-darkest-bg">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">When</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Who</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-discord-dark-bg/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap" title={new Date(entry.createdAt).toISOString()}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-200">
                        {entry.username ?? <span className="font-mono text-xs text-gray-500">{entry.userId}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${METHOD_STYLES[entry.method] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
                          {METHOD_VERBS[entry.method] ?? entry.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {humanizeSection(entry.section)}
                        <span className="block text-[11px] text-gray-600 font-mono truncate max-w-[260px]">{entry.path}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-xs text-gray-500">Page {page} of {pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="btn-secondary flex items-center gap-1 disabled:opacity-40"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
