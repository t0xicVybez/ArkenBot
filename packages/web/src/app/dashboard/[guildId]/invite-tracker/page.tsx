'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inviteTrackerApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { UserPlus, Trophy, ChevronDown, ChevronRight, UserCheck, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface Invitee {
  userId: string;
  username: string;
  joinedAt: string;
  leftAt: string | null;
}

interface InviteRow {
  userId: string;
  username: string;
  invites: number;
  leaves: number;
  bonus: number;
  invitees: Invitee[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

function InviterRow({ row, rank }: { row: InviteRow; rank: number }) {
  const t = useTranslations('inviteTracker');
  const [expanded, setExpanded] = useState(false);
  const total = row.invites + row.bonus;
  const invitees  = row.invitees ?? [];
  const stillHere = invitees.filter((i) => !i.leftAt).length;
  const left      = invitees.filter((i) => i.leftAt).length;

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg w-6 text-center">{MEDALS[rank] ?? `${rank + 1}.`}</span>
          <span className="text-white text-sm font-medium">{row.username}</span>
          {invitees.length > 0 && (
            <span className="text-[11px] text-gray-500">({t('memberCount', { count: invitees.length })})</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400">{t('inviteCount', { count: row.invites })}</span>
          {row.bonus !== 0 && (
            <span className={row.bonus > 0 ? 'text-green-400' : 'text-red-400'}>
              {t('bonus', { bonus: `${row.bonus > 0 ? '+' : ''}${row.bonus}` })}
            </span>
          )}
          <span className="text-discord-blurple font-semibold">{t('total', { total })}</span>
          {invitees.length > 0
            ? expanded
              ? <ChevronDown className="w-4 h-4 text-gray-500" />
              : <ChevronRight className="w-4 h-4 text-gray-500" />
            : <span className="w-4" />
          }
        </div>
      </button>

      {expanded && invitees.length > 0 && (
        <div className="border-t border-white/[0.04] px-3 py-2 space-y-1.5 bg-black/20">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-2">
            {t('invitedMembers', { stillHere, left })}
          </p>
          {invitees.map((invitee) => (
            <div
              key={invitee.userId}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white/[0.03]"
            >
              <div className="flex items-center gap-2">
                {invitee.leftAt
                  ? <UserMinus className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  : <UserCheck className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                }
                <span className="text-sm text-gray-200">{invitee.username}</span>
                {invitee.leftAt && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">{t('leftBadge')}</span>
                )}
              </div>
              <span className="text-[11px] text-gray-600">
                {t('joinedOn', { date: new Date(invitee.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InviteTrackerPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('inviteTracker');
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: ['invite-tracker', guildId],
    queryFn:  () => inviteTrackerApi.get(guildId),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => inviteTrackerApi.setEnabled(guildId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-tracker', guildId] });
    },
    onError: () => toast.error(t('updateError')),
  });

  const data = res?.data?.data as { enabled: boolean; leaderboard: InviteRow[] } | undefined;
  const enabled     = data?.enabled ?? false;
  const leaderboard = data?.leaderboard ?? [];

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(2)].map((_, i) => <div key={i} className="card h-32 bg-gray-700" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><UserPlus className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>

      <SettingsSection title={t('settingsTitle')} description={t('settingsDesc')}>
        <label className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">{t('enableLabel')}</span>
          <div
            className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-discord-blurple' : 'bg-gray-600'} relative`}
            onClick={() => toggleMutation.mutate(!enabled)}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </label>
        {!enabled && (
          <p className="text-gray-500 text-xs">{t('enableHelp')}</p>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('leaderboardTitle')}
        description={t('leaderboardDesc')}
      >
        {leaderboard.length === 0 ? (
          <div className="text-center py-8">
            <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">{t('noData')}{!enabled && ` ${t('noDataEnable')}`}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((row, i) => (
              <InviterRow key={row.userId} row={row} rank={i} />
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
