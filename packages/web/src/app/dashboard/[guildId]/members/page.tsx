'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { membersApi, guildsApi } from '@/lib/api';
import { Users } from 'lucide-react';
import { useState } from 'react';

export default function MembersPage() {
  const { guildId } = useParams() as { guildId: string };
  const [search, setSearch] = useState('');

  const { data: membersRes, isLoading } = useQuery({
    queryKey: ['members', guildId, search],
    queryFn: () => membersApi.search(guildId, search || undefined),
    staleTime: 30000,
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const members = (membersRes?.data as { data?: { userId: string; userTag: string; level: number; xp: number }[] })?.data ?? [];
  const roles = (rolesRes?.data as { data?: { id: string; name: string }[] })?.data ?? [];

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Users className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Members</h1>
          <div className="page-head-desc">Search and view tracked members</div>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          className="input max-w-sm"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead className="bg-[var(--bg-base)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Level</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={3} className="px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                  {search ? 'No members found matching your search.' : 'No members tracked yet.'}
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.userId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm text-white">{m.userTag}</p>
                      <p className="text-xs text-gray-500 font-mono">{m.userId}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-info">Lv. {m.level}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {m.xp.toLocaleString()} XP
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {roles.length > 0 && (
        <div className="mt-6 card">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Available Roles</h3>
          <div className="flex flex-wrap gap-2">
            {roles.filter((r) => r.name !== '@everyone').map((r) => (
              <span key={r.id} className="badge badge-info text-xs">{r.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
