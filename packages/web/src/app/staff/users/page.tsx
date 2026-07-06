'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Users } from 'lucide-react';

export default function StaffUsersPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: usersRes, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminApi.getUsers({ search: search || undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, isStaff }: { id: string; isStaff: boolean }) =>
      adminApi.updateUser(id, { isStaff }),
    onSuccess: () => {
      toast.success('User updated!');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => toast.error('Failed to update user.'),
  });

  const users = (usersRes?.data?.data ?? []) as Array<{
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
    isStaff: boolean;
    isBotOwner: boolean;
    createdAt: string;
  }>;

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><Users className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Portal Users</h1>
          <div className="page-head-desc">Staff roles and dashboard access.</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="relative">
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

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-[var(--bg-base)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Joined</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded" />
                  </td>
                </tr>
              ))
            ) : users.map((user) => (
              <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {user.avatar ? (
                      <img
                        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                        alt={user.username}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-discord-blurple flex items-center justify-center text-white text-xs">
                        {user.username[0]}
                      </div>
                    )}
                    <span className="text-sm text-white">{user.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{user.id}</td>
                <td className="px-4 py-3">
                  {user.isBotOwner ? (
                    <span className="badge-warning">Owner</span>
                  ) : user.isStaff ? (
                    <span className="badge-info">Staff</span>
                  ) : (
                    <span className="badge">User</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {!user.isBotOwner && (
                    <button
                      onClick={() => updateMutation.mutate({ id: user.id, isStaff: !user.isStaff })}
                      className={`text-xs py-1 px-2 rounded ${user.isStaff ? 'btn-danger' : 'btn-primary'}`}
                    >
                      {user.isStaff ? 'Remove Staff' : 'Make Staff'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
