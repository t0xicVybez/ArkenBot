'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import { Search, Server, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useWebSocket } from '@/lib/socket';

export default function StaffGuildsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('');

  const { data: guildsRes, isLoading } = useQuery({
    queryKey: ['admin-guilds', page, search, activeFilter],
    queryFn: () => adminApi.getGuilds({ page, search: search || undefined, active: activeFilter || undefined }),
  });

  // Invalidate guild list instantly when bot joins or leaves a server
  useWebSocket('guild:joined', () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }));
  useWebSocket('guild:left', () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }));

  const deleteGuildMutation = useMutation({
    mutationFn: (guildId: string) => adminApi.deleteGuild(guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }),
  });

  const guilds = (guildsRes?.data?.data?.items ?? []) as Array<{
    id: string;
    name: string;
    iconUrl?: string;
    ownerId: string;
    memberCount: number | null;
    isActive: boolean;
    joinedAt: string;
  }>;
  const total = guildsRes?.data?.data?.total ?? 0;
  const hasMore = guildsRes?.data?.data?.hasMore ?? false;

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">All Guilds</h1>
        <p className="text-gray-400 text-sm">Total: {total} guilds</p>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search guilds..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          className="input sm:w-40"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-discord-darkest-bg">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Guild</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Joined</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded" />
                  </td>
                </tr>
              ))
            ) : guilds.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No guilds found
                </td>
              </tr>
            ) : (
              guilds.map((guild) => (
                <tr key={guild.id} className="hover:bg-discord-dark-bg/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {guild.iconUrl ? (
                        <img src={guild.iconUrl} alt={guild.name} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-discord-blurple flex items-center justify-center text-white text-xs font-bold">
                          {guild.name[0]}
                        </div>
                      )}
                      <span className="text-sm text-white font-medium">{guild.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">{guild.id}</td>
                  <td className="px-4 py-3">
                    <span className={guild.isActive ? 'badge-success' : 'badge-danger'}>
                      {guild.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(guild.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/${guild.id}`}
                        className="text-discord-blurple hover:text-blue-400 transition-colors text-sm flex items-center gap-1"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                      {!guild.isActive && (
                        <button
                          type="button"
                          disabled={deleteGuildMutation.isPending}
                          onClick={() => {
                            if (!window.confirm(`Delete inactive guild ${guild.name}? This will remove its settings and remove it from the staff portal.`)) {
                              return;
                            }
                            deleteGuildMutation.mutate(guild.id);
                          }}
                          className="btn-danger text-xs py-1 px-2 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {total > 20 && (
          <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Page {page} • {total} total guilds
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs py-1 px-3">
                Previous
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="btn-secondary text-xs py-1 px-3">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
