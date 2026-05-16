'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import api from '@/lib/api';

type Giveaway = {
  id: string;
  prize: string;
  hostId: string;
  endsAt: string;
  ended: boolean;
  winnersCount: number;
  winnerIds: string[];
  winnerNames: string[];
};

const giveawaysApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/giveaways`),
};

export default function GiveawaysPage() {
  const { guildId } = useParams() as { guildId: string };

  const { data: res, isLoading } = useQuery({
    queryKey: ['giveaways', guildId],
    queryFn: () => giveawaysApi.list(guildId),
  });

  const giveaways: Giveaway[] = (res?.data as { data?: Giveaway[] })?.data ?? [];
  const active = giveaways.filter((g) => !g.ended);
  const ended = giveaways.filter((g) => g.ended);

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
      <div className="mb-6 flex items-center gap-3">
        <Gift className="w-6 h-6 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold text-white">Giveaways</h1>
          <p className="text-sm text-gray-400">View active and past giveaways in this server.</p>
        </div>
      </div>

      <div className="card mb-6 border border-blue-500/20 bg-blue-500/5">
        <p className="text-sm text-blue-300">
          Giveaways are started in Discord via the{' '}
          <code className="font-mono text-blue-200 bg-blue-900/30 px-1 rounded">/giveaway start</code>{' '}
          command. This page shows a read-only overview of all giveaways.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Active Giveaways</h2>
        {active.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-gray-500 text-sm">No active giveaways right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((g) => (
              <GiveawayCard key={g.id} giveaway={g} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Ended Giveaways</h2>
        {ended.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-gray-500 text-sm">No ended giveaways yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ended.map((g) => (
              <GiveawayCard key={g.id} giveaway={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GiveawayCard({ giveaway }: { giveaway: Giveaway }) {
  const endsDate = new Date(giveaway.endsAt);
  const dateStr = endsDate.toLocaleString();

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-semibold text-white truncate">{giveaway.prize}</span>
            {giveaway.ended ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 flex-shrink-0">Ended</span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 flex-shrink-0">Active</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>Host: <span className="font-mono text-gray-300">{giveaway.hostId}</span></span>
            <span>{giveaway.ended ? 'Ended' : 'Ends'}: <span className="text-gray-300">{dateStr}</span></span>
            <span>Winners: <span className="text-gray-300">{giveaway.winnersCount}</span></span>
          </div>
          {giveaway.ended && giveaway.winnerNames?.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-400">Winner{giveaway.winnerNames.length > 1 ? 's' : ''}: </span>
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
