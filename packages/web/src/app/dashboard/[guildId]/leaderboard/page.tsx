'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Trophy, Medal, Star, TrendingUp, MessageSquare, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userTag: string;
  level: number;
  xp: number;
  totalMessages: number;
  xpIntoLevel: number;
  xpForNext: number;
}

interface LeaderboardData {
  guild: { id: string; name: string; iconUrl: string | null };
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  hasMore: boolean;
}

function fetchLeaderboard(guildId: string, page: number) {
  return axios
    .get<{ success: boolean; data: LeaderboardData }>(
      `${API_URL}/public/leaderboard/${guildId}?page=${page}&limit=25`,
    )
    .then((r) => r.data.data);
}

const TOP3_STYLES: Record<number, { icon: ReactNode; ring: string; bg: string }> = {
  1: {
    icon: <Trophy className="w-4 h-4 text-yellow-400" />,
    ring: 'ring-yellow-500/30',
    bg: 'bg-yellow-500/5',
  },
  2: {
    icon: <Medal className="w-4 h-4 text-gray-300" />,
    ring: 'ring-gray-400/30',
    bg: 'bg-gray-400/5',
  },
  3: {
    icon: <Medal className="w-4 h-4 text-amber-600" />,
    ring: 'ring-amber-600/30',
    bg: 'bg-amber-600/5',
  },
};

export default function LeaderboardDashboardPage() {
  const { guildId } = useParams() as { guildId: string };
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-leaderboard', guildId, page],
    queryFn: () => fetchLeaderboard(guildId, page),
    retry: false,
    refetchInterval: 60000,
  });

  const allEntries = data?.entries ?? [];
  const entries = search
    ? allEntries.filter((e) => e.userTag.toLowerCase().includes(search.toLowerCase()))
    : allEntries;
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;
  const pageStart = (page - 1) * 25 + 1;
  const pageEnd = Math.min(page * 25, total);

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <TrendingUp className="w-6 h-6 text-discord-blurple" />
            <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
          </div>
          <Link
            href={`/leaderboard/${guildId}`}
            target="_blank"
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Public View
          </Link>
        </div>
        <p className="text-gray-400 text-sm">
          {total > 0 ? `${total.toLocaleString()} ranked members` : 'Member XP rankings'}
        </p>
      </div>

      {/* Search */}
      <div className="card mb-4 flex gap-3 py-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-white/[0.04] last:border-0 animate-pulse">
              <div className="h-4 bg-gray-700/50 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl text-center py-12">
          <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Leaderboard unavailable.</p>
          <p className="text-gray-600 text-sm mt-1">Leveling may be disabled for this server.</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && allEntries.length === 0 && (
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl text-center py-12">
          <Star className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No ranked members yet.</p>
          <p className="text-gray-600 text-sm mt-1">Members earn XP by chatting in the server.</p>
        </div>
      )}

      {/* Entries */}
      {!isLoading && !isError && entries.length > 0 && (
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_6rem_5rem] gap-4 px-4 py-2.5 bg-discord-darkest-bg border-b border-white/[0.06] min-w-[340px]">
            <span className="text-xs font-medium text-gray-400 uppercase">#</span>
            <span className="text-xs font-medium text-gray-400 uppercase">Member</span>
            <span className="text-xs font-medium text-gray-400 uppercase text-right">Level</span>
            <span className="text-xs font-medium text-gray-400 uppercase text-right">Messages</span>
          </div>

          <div className="divide-y divide-white/[0.04] min-w-[340px]">
            {entries.map((entry) => {
              const pct = entry.xpForNext > 0
                ? Math.min(100, Math.round((entry.xpIntoLevel / entry.xpForNext) * 100))
                : 100;
              const top3 = TOP3_STYLES[entry.rank];

              return (
                <div
                  key={entry.userId}
                  className={`grid grid-cols-[2rem_1fr_6rem_5rem] gap-4 px-4 py-3 items-center transition-colors hover:bg-white/[0.02] ${
                    top3 ? `${top3.bg} ring-inset ring-1 ${top3.ring}` : ''
                  }`}
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center">
                    {top3 ? top3.icon : (
                      <span className="text-gray-500 text-sm font-mono">#{entry.rank}</span>
                    )}
                  </div>

                  {/* User + XP bar */}
                  <div className="min-w-0">
                    <span className="text-white text-sm font-medium truncate block">{entry.userTag}</span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 bg-gray-700/60 rounded-full h-1.5 overflow-hidden max-w-xs">
                        <div
                          className="h-full bg-discord-blurple rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 flex-shrink-0">
                        {entry.xpIntoLevel.toLocaleString()} / {entry.xpForNext.toLocaleString()} XP
                      </span>
                    </div>
                  </div>

                  {/* Level */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-discord-blurple">Lv. {entry.level}</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">{entry.xp.toLocaleString()} total XP</p>
                  </div>

                  {/* Messages */}
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-gray-300">
                      <MessageSquare className="w-3 h-3 text-gray-500" />
                      <span className="text-sm">{entry.totalMessages.toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5">messages</p>
                  </div>
                </div>
              );
            })}
          </div>
          </div>{/* /overflow-x-auto */}

          {/* Pagination footer */}
          {(page > 1 || hasMore) && (
            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Showing {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search no results */}
      {!isLoading && !isError && allEntries.length > 0 && entries.length === 0 && (
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl text-center py-12">
          <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-400">No members match &ldquo;{search}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
