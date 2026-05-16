'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { Trophy, Medal, Star, MessageSquare, TrendingUp } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userTag: string;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  totalMessages: number;
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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-gray-500 font-mono text-sm w-8 text-center">#{rank}</span>;
}

function XpBar({ xpIntoLevel, xpForNext }: { xpIntoLevel: number; xpForNext: number }) {
  const pct = xpForNext > 0 ? Math.min((xpIntoLevel / xpForNext) * 100, 100) : 100;
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5">
      <div
        className="bg-discord-blurple h-1.5 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function LeaderboardPage() {
  const params = useParams();
  const guildId = params.guildId as string;
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', guildId, page],
    queryFn: () => fetchLeaderboard(guildId, page),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-discord-darkest-bg flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-lg">Loading leaderboard…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-discord-darkest-bg flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Leaderboard not available for this server.</p>
          <p className="text-gray-600 text-sm mt-1">Leveling may be disabled or the server may not exist.</p>
        </div>
      </div>
    );
  }

  const { guild, entries, total, hasMore } = data;

  return (
    <div className="min-h-screen bg-discord-darkest-bg text-white">
      {/* Header */}
      <div className="bg-discord-darker-bg border-b border-gray-700/50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            {guild.iconUrl ? (
              <img src={guild.iconUrl} alt={guild.name} className="w-16 h-16 rounded-full" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-discord-blurple flex items-center justify-center text-2xl font-bold">
                {guild.name[0]}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{guild.name}</h1>
              <p className="text-gray-400 text-sm flex items-center gap-1.5 mt-0.5">
                <TrendingUp className="w-4 h-4" />
                {total} ranked members
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {entries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            No members ranked yet. Start chatting!
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.userId}
                className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                  entry.rank <= 3
                    ? 'bg-discord-darker-bg border-gray-600/50'
                    : 'bg-discord-dark-bg/50 border-gray-700/30 hover:border-gray-600/50'
                }`}
              >
                {/* Rank */}
                <div className="w-10 flex-shrink-0 flex items-center justify-center">
                  <RankBadge rank={entry.rank} />
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium truncate text-sm">{entry.userTag}</span>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-discord-blurple font-bold text-sm">
                        Level {entry.level}
                      </span>
                      <span className="text-gray-500 text-xs flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {entry.totalMessages.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <XpBar xpIntoLevel={entry.xpIntoLevel} xpForNext={entry.xpForNext} />
                    <span className="text-gray-600 text-xs flex-shrink-0">
                      {entry.xpIntoLevel.toLocaleString()}/{entry.xpForNext.toLocaleString()} XP
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 25 && (
          <div className="flex items-center justify-between mt-6 text-sm">
            <p className="text-gray-500">Page {page} • {total} total</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p: number) => p + 1)}
                disabled={!hasMore}
                className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-gray-700 text-xs mt-8">
          Powered by Arken Bot • Leaderboard updates in real time
        </p>
      </div>
    </div>
  );
}
