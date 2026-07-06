'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { guildsApi } from '@/lib/api';
import type { GuildOverview } from '@arkenbot/shared';
import Link from 'next/link';
import { Bot, Search } from 'lucide-react';

export default function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) router.push('/auth');
  }, [hydrated, isAuthenticated, router]);

  const { data: guildsRes, isLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: () => guildsApi.list(),
    enabled: hydrated && isAuthenticated,
  });

  const allGuilds: GuildOverview[] = guildsRes?.data?.data ?? [];
  const [search, setSearch] = useState('');
  const filtered = allGuilds.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const activeGuilds = filtered.filter((g) => g.botPresent);
  const inactiveGuilds = filtered.filter((g) => !g.botPresent);

  if (!hydrated || !isAuthenticated) return null;

  const GuildCard = ({ guild }: { guild: GuildOverview }) => (
    <div className="flex items-center gap-3 mb-3">
      {guild.iconUrl ? (
        <img src={guild.iconUrl} alt={guild.name} className="w-12 h-12 rounded-full" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-discord-blurple flex items-center justify-center text-white font-bold">
          {guild.name[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold truncate group-hover:text-discord-blurple transition-colors">
          {guild.name}
        </p>
        <p className="text-gray-400 text-xs">{guild.memberCount?.toLocaleString() ?? '—'} members</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Select a Server</h1>
            <p className="text-gray-400 text-sm">Choose a server to manage its settings</p>
          </div>
          {user?.isStaff && (
            <Link href="/staff" className="btn-secondary text-sm">
              Staff Portal
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-full"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : allGuilds.length === 0 ? (
          <div className="text-center py-20">
            <Bot className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No servers found</h2>
            <p className="text-gray-400 mb-6">
              You don&apos;t have admin permissions in any server with the bot.
            </p>
            <a
              href={`https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot%20applications.commands`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              Invite Bot to Your Server
            </a>
          </div>
        ) : (
          <>
            {/* Active servers */}
            {activeGuilds.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {activeGuilds.map((guild) => (
                  <Link
                    key={guild.id}
                    href={`/dashboard/${guild.id}`}
                    className="card hover:border-discord-blurple/50 transition-colors group cursor-pointer"
                  >
                    <GuildCard guild={guild} />
                    <span className="badge-success">● Bot Active</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Servers needing invite */}
            {inactiveGuilds.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                  Invite bot to manage
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {inactiveGuilds.map((guild) => (
                    <div key={guild.id} className="card group">
                      <GuildCard guild={guild} />
                      <a
                        href={`https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&guild_id=${guild.id}&permissions=8824675416665207&integration_type=0&scope=bot%20applications.commands`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary text-xs py-1"
                      >
                        Invite Bot
                      </a>
                    </div>
                  ))}
                </div>
              </>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-500">No servers match &quot;{search}&quot;</div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
