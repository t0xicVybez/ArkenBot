'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pollsApi } from '@/lib/api';
import { BarChart, Trash2, XCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';

type Poll = {
  id: string;
  question: string;
  options: string[];
  votes: { id: string; optionIndex: number; userId: string }[];
  closed: boolean;
  createdAt: string;
};

export default function PollsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('polls');
  const queryClient = useQueryClient();

  const { data: pollsRes, isLoading } = useQuery({
    queryKey: ['polls', guildId],
    queryFn: () => pollsApi.list(guildId),
  });

  const polls: Poll[] = (pollsRes?.data as { data?: Poll[] })?.data ?? [];

  const closeMutation = useMutation({
    mutationFn: (pollId: string) => pollsApi.close(guildId, pollId),
    onSuccess: () => {
      toast.success(t('closed'));
      queryClient.invalidateQueries({ queryKey: ['polls', guildId] });
    },
    onError: () => toast.error(t('closeError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (pollId: string) => pollsApi.delete(guildId, pollId),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey: ['polls', guildId] });
    },
    onError: () => toast.error(t('deleteError')),
  });

  const getTotalVotes = (poll: Poll) => poll.votes?.length ?? 0;

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><BarChart className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-discord-blurple/10 border border-discord-blurple/30 mb-6">
        <Info className="w-4 h-4 text-discord-blurple mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-300">
          {t.rich('createdVia', { cmd: (chunks) => <span className="font-mono text-discord-blurple">{chunks}</span> })}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-5 bg-gray-700 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : polls.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const totalVotes = getTotalVotes(poll);
            return (
              <div key={poll.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`badge ${poll.closed ? 'badge-danger' : 'badge-success'}`}
                      >
                        {poll.closed ? t('statusClosed') : t('statusOpen')}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white truncate">{poll.question}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                      <span>{t('optionCount', { count: poll.options.length })}</span>
                      <span>{t('voteCount', { count: totalVotes })}</span>
                      <span>{t('createdOn', { date: new Date(poll.createdAt).toLocaleDateString() })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => closeMutation.mutate(poll.id)}
                      disabled={poll.closed || closeMutation.isPending}
                      className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={poll.closed ? t('alreadyClosed') : t('closePollTitle')}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {t('closePoll')}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(poll.id)}
                      disabled={deleteMutation.isPending}
                      className="btn-danger text-sm py-1.5 px-3 flex items-center gap-1.5"
                      title={t('deletePollTitle')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('delete')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
