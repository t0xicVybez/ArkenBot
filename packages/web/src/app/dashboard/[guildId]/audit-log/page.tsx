'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auditLogApi } from '@/lib/api';
import { useState } from 'react';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

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

/** "trello-alerts" → "Trello Alerts" */
function humanizeSection(section: string): string {
  return section
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function AuditLogPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('auditLog');
  const [page, setPage] = useState(1);
  const methodVerb = (m: string): string =>
    ({ POST: t('verbCreated'), PATCH: t('verbUpdated'), DELETE: t('verbDeleted') } as Record<string, string>)[m] ?? m;

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
      <div className="page-head">
        <div className="page-head-icon"><History className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><History className="w-6 h-6" /></div>
          <h4>{t('emptyTitle')}</h4>
          <p>{t('emptyDesc')}</p>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            {(() => {
              const groups: Array<{ day: string; items: AuditEntry[] }> = [];
              for (const entry of entries) {
                const d = new Date(entry.createdAt);
                const today = new Date();
                const yesterday = new Date(Date.now() - 86400000);
                const day = d.toDateString() === today.toDateString() ? t('today')
                  : d.toDateString() === yesterday.toDateString() ? t('yesterday')
                  : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                const g = groups[groups.length - 1];
                if (g && g.day === day) g.items.push(entry);
                else groups.push({ day, items: [entry] });
              }
              return groups.map((group) => (
                <div key={group.day}>
                  <div className="px-4 pt-4 pb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{group.day}</div>
                  {group.items.map((entry) => {
                    const initials = (entry.username ?? '??').slice(0, 2);
                    return (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
                        <div className="w-7 h-7 rounded-full grid place-items-center flex-shrink-0 text-[10px] font-extrabold bg-[var(--accent-glow)] text-[var(--accent)]">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0 text-[13px]">
                          <span className="font-semibold text-white">{entry.username ?? entry.userId}</span>{' '}
                          <span className={`inline-block align-middle mx-1 text-[10.5px] font-semibold px-2 py-px rounded-full border ${METHOD_STYLES[entry.method] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
                            {methodVerb(entry.method)}
                          </span>{' '}
                          <span className="text-gray-300">{humanizeSection(entry.section)}</span>
                          <div className="font-mono text-[10.5px] text-[var(--text-muted)] truncate">{entry.path}</div>
                        </div>
                        <time className="text-[11.5px] text-[var(--text-muted)] tabular flex-shrink-0 pt-0.5" title={new Date(entry.createdAt).toISOString()}>
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> {t('previous')}
              </button>
              <span className="text-xs text-gray-500">{t('pageOf', { page, pages })}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="btn-secondary flex items-center gap-1 disabled:opacity-40"
              >
                {t('next')} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
