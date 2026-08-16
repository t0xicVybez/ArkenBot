'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Gift, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Giveaway = {
  id: string;
  prize: string;
  hostId: string;
  endsAt: string;
  ended: boolean;
  winnersCount: number;
  winnerIds: string[];
  winnerNames: string[];
  requiredRoleId?: string | null;
  bonusRoleEntries?: Array<{ roleId: string; entries: number }> | null;
};

const giveawaysApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/giveaways`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/giveaways`, data),
};

export default function GiveawaysPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('giveawaysPage');
  const queryClient = useQueryClient();

  // Create form state
  const [prize, setPrize] = useState('');
  const [duration, setDuration] = useState('');
  const [winnersCount, setWinnersCount] = useState('1');
  const [channelId, setChannelId] = useState('');
  const [requiredRoleId, setRequiredRoleId] = useState('');
  const [bonusRoleId, setBonusRoleId] = useState('');
  const [bonusEntries, setBonusEntries] = useState('1');

  const { data: res, isLoading } = useQuery({
    queryKey: ['giveaways', guildId],
    queryFn: () => giveawaysApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => giveawaysApi.create(guildId, data),
    onSuccess: () => {
      toast.success(t('giveawayCreated'));
      queryClient.invalidateQueries({ queryKey: ['giveaways', guildId] });
      setPrize('');
      setDuration('');
      setWinnersCount('1');
      setChannelId('');
      setRequiredRoleId('');
      setBonusRoleId('');
      setBonusEntries('1');
    },
    onError: () => toast.error(t('createError')),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const roles = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
  const assignableRoles = roles.filter((r) => r.name !== '@everyone');

  const giveaways: Giveaway[] = (res?.data as { data?: Giveaway[] })?.data ?? [];
  const active = giveaways.filter((g) => !g.ended);
  const ended = giveaways.filter((g) => g.ended);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prize.trim()) return toast.error(t('prizeRequired'));
    if (!duration.trim()) return toast.error(t('durationRequired'));
    if (!channelId) return toast.error(t('channelRequired'));
    const count = parseInt(winnersCount);
    if (!count || count < 1) return toast.error(t('winnersMin'));

    const payload: Record<string, unknown> = {
      prize: prize.trim(),
      duration: duration.trim(),
      winnersCount: count,
      channelId,
    };
    if (requiredRoleId) payload.requiredRoleId = requiredRoleId;
    if (bonusRoleId) {
      const entries = parseInt(bonusEntries);
      if (entries > 0) {
        payload.bonusRoleEntries = [{ roleId: bonusRoleId, entries }];
      }
    }
    createMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-4xl space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-28 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Gift className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Create Giveaway */}
      <div className="card mb-8">
        <h3 className="text-base font-semibold text-white mb-4">{t('createGiveaway')}</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('prize')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('prizePlaceholder')}
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t('duration')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('durationPlaceholder')}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">{t('durationHelp')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('channel')}</label>
              <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                <option value="">{t('selectChannel')}</option>
                {textChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('numWinners')}</label>
              <input
                type="number"
                className="input"
                min={1}
                max={20}
                value={winnersCount}
                onChange={(e) => setWinnersCount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('requiredRoleOptional')}</label>
              <select className="input" value={requiredRoleId} onChange={(e) => setRequiredRoleId(e.target.value)}>
                <option value="">{t('none')}</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>@{r.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('requiredRoleHelp')}</p>
            </div>
            <div>
              <label className="label">{t('bonusRoleOptional')}</label>
              <select className="input" value={bonusRoleId} onChange={(e) => setBonusRoleId(e.target.value)}>
                <option value="">{t('none')}</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>@{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          {bonusRoleId && (
            <div className="sm:w-48">
              <label className="label">{t('bonusEntries')}</label>
              <input
                type="number"
                className="input"
                min={1}
                max={10}
                value={bonusEntries}
                onChange={(e) => setBonusEntries(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">{t('bonusEntriesHelp')}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? t('creating') : t('createGiveaway')}
          </button>
        </form>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">{t('activeGiveaways')}</h2>
        {active.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-gray-500 text-sm">{t('noActive')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((g) => (
              <GiveawayCard key={g.id} giveaway={g} roles={assignableRoles} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">{t('endedGiveaways')}</h2>
        {ended.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-gray-500 text-sm">{t('noEnded')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ended.map((g) => (
              <GiveawayCard key={g.id} giveaway={g} roles={assignableRoles} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GiveawayCard({ giveaway, roles }: { giveaway: Giveaway; roles: Array<{ id: string; name: string }> }) {
  const t = useTranslations('giveawaysPage');
  const endsDate = new Date(giveaway.endsAt);
  const dateStr = endsDate.toLocaleString();

  const requiredRole = giveaway.requiredRoleId
    ? roles.find((r) => r.id === giveaway.requiredRoleId)
    : null;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-semibold text-white truncate">{giveaway.prize}</span>
            {giveaway.ended ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 flex-shrink-0">{t('statusEnded')}</span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 flex-shrink-0">{t('statusActive')}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>{t('hostLabel')}: <span className="font-mono text-gray-300">{giveaway.hostId}</span></span>
            <span>{giveaway.ended ? t('endedLabel') : t('endsLabel')}: <span className="text-gray-300">{dateStr}</span></span>
            <span>{t('winnersLabel')}: <span className="text-gray-300">{giveaway.winnersCount}</span></span>
          </div>
          {(giveaway.requiredRoleId || (giveaway.bonusRoleEntries && giveaway.bonusRoleEntries.length > 0)) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {giveaway.requiredRoleId && (
                <span className="text-xs bg-discord-blurple/15 text-discord-blurple px-2 py-0.5 rounded-full">
                  {t('requiredTag', { role: requiredRole?.name ?? giveaway.requiredRoleId })}
                </span>
              )}
              {giveaway.bonusRoleEntries?.map((bonus) => {
                const bonusRole = roles.find((r) => r.id === bonus.roleId);
                return (
                  <span key={bonus.roleId} className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full">
                    {t('bonusTag', { role: bonusRole?.name ?? bonus.roleId, entries: bonus.entries })}
                  </span>
                );
              })}
            </div>
          )}
          {giveaway.ended && giveaway.winnerNames?.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-400">{t('winnersResult', { count: giveaway.winnerNames.length })} </span>
              {giveaway.winnerNames.map((name, i) => (
                <span key={i} className="text-xs font-medium bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded mr-1">{name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
