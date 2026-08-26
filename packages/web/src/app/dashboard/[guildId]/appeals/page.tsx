'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gavel, Check, X } from 'lucide-react';
import { appealsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Appeal = {
  id: string;
  userId: string;
  userTag: string;
  type: string;
  reason: string;
  status: string;
  reviewedBy?: string | null;
  createdAt: string;
};

export default function AppealsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('appealsPage');
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');

  const { data: res, isLoading } = useQuery({
    queryKey: ['appeals', guildId, filter],
    queryFn: () => appealsApi.listForGuild(guildId, filter === 'all' ? undefined : filter),
  });
  const appeals: Appeal[] = (res?.data as { data?: Appeal[] })?.data ?? [];

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deny' }) => appealsApi.decide(guildId, id, action),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'approve' ? t('approved') : t('denied'));
      queryClient.invalidateQueries({ queryKey: ['appeals', guildId] });
    },
    onError: () => toast.error(t('error')),
  });

  const badge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-500/15 text-yellow-400',
      approved: 'bg-green-500/15 text-green-400',
      denied: 'bg-red-500/15 text-red-400',
    };
    return <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? ''}`}>{t(`status.${status}`)}</span>;
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Gavel className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'denied', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${filter === f ? 'bg-discord-blurple/20 border-discord-blurple text-white' : 'border-[var(--border-subtle)] text-[var(--text-muted)]'}`}>
            {t(`filter.${f}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => (<div key={i} className="card h-28 animate-pulse bg-gray-700" />))}</div>
      ) : appeals.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-12">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {appeals.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{a.userTag}</span>
                    <span className="text-xs text-gray-500">{t(`type.${a.type}`)}</span>
                    {badge(a.status)}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">{a.userId}</div>
                </div>
                {a.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button className="btn-primary !bg-green-600 hover:!bg-green-700 flex items-center gap-1 text-sm" disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: a.id, action: 'approve' })}>
                      <Check className="w-4 h-4" /> {t('approve')}
                    </button>
                    <button className="btn-secondary flex items-center gap-1 text-sm" disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: a.id, action: 'deny' })}>
                      <X className="w-4 h-4" /> {t('deny')}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{a.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
