'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Server, Users, Shield, Puzzle, TrendingUp, Clock, type LucideIcon } from 'lucide-react';
import type { SystemStats } from '@arkenbot/shared';
import { useWebSocket } from '@/lib/socket';

const statColors = {
  blue:   { ring: 'ring-blue-500/20',   bg: 'bg-blue-500/10',   text: 'text-blue-400' },
  green:  { ring: 'ring-green-500/20',  bg: 'bg-green-500/10',  text: 'text-green-400' },
  purple: { ring: 'ring-purple-500/20', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  red:    { ring: 'ring-red-500/20',    bg: 'bg-red-500/10',    text: 'text-red-400' },
  yellow: { ring: 'ring-yellow-500/20', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
};

function StatCard({ title, value, icon: Icon, color = 'blue' }: {
  title: string; value: string | number; icon: LucideIcon; color?: keyof typeof statColors;
}) {
  const c = statColors[color];
  return (
    <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${c.bg} ring-1 ${c.ring} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-white leading-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}

export default function StaffDashboard() {
  const queryClient = useQueryClient();

  const { data: statsRes, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats(),
  });

  useWebSocket('guild:joined', () => queryClient.invalidateQueries({ queryKey: ['admin-stats'] }));
  useWebSocket('guild:left', () => queryClient.invalidateQueries({ queryKey: ['admin-stats'] }));
  useWebSocket('bot:ready', () => queryClient.invalidateQueries({ queryKey: ['admin-stats'] }));

  const stats = statsRes?.data?.data as SystemStats | undefined;

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Staff Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">System-wide overview and management</p>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-discord-darker-bg border border-white/[0.06] rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard title="Total Guilds" value={stats?.totalGuilds ?? 0} icon={Server} color="blue" />
          <StatCard title="Active Guilds" value={stats?.activeGuilds ?? 0} icon={Server} color="green" />
          <StatCard title="Total Users" value={stats?.totalUsers ?? 0} icon={Users} color="purple" />
          <StatCard title="Mod Cases" value={stats?.totalCases ?? 0} icon={Shield} color="red" />
          <StatCard title="Active Warnings" value={stats?.totalWarnings ?? 0} icon={Shield} color="yellow" />
          <StatCard title="Addons" value={stats?.totalAddons ?? 0} icon={Puzzle} color="blue" />
          <StatCard title="Uptime" value={stats?.uptime ? formatUptime(stats.uptime) : '—'} icon={Clock} color="green" />
          <StatCard title="Memory Usage" value={stats?.memoryUsage ? `${stats.memoryUsage} MB` : '—'} icon={TrendingUp} color="yellow" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick Actions */}
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/staff/guilds', icon: Server, label: 'Browse Guilds', color: 'text-blue-400 bg-blue-500/10' },
              { href: '/staff/users', icon: Users, label: 'Manage Users', color: 'text-green-400 bg-green-500/10' },
              { href: '/staff/addons', icon: Puzzle, label: 'Addon Registry', color: 'text-pink-400 bg-pink-500/10' },
              { href: '/staff/logs', icon: Shield, label: 'System Logs', color: 'text-yellow-400 bg-yellow-500/10' },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 px-3 py-3 rounded-lg bg-discord-darkest-bg border border-white/[0.04] hover:border-white/[0.10] transition-colors group"
              >
                <div className={`w-7 h-7 rounded-md ${action.color} flex items-center justify-center flex-shrink-0`}>
                  <action.icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">System Info</h2>
          <div className="space-y-2.5">
            {[
              { label: 'Version', value: stats?.version ?? '1.0.0', mono: true },
              { label: 'Environment', value: process.env.NODE_ENV ?? 'development', badge: true },
              { label: 'Memory', value: stats?.memoryUsage ? `${stats.memoryUsage} MB heap used` : '—', mono: false },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-discord-darkest-bg border border-white/[0.04]"
              >
                <span className="text-xs text-gray-500">{row.label}</span>
                {row.badge ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    row.value === 'production'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-yellow-500/15 text-yellow-400'
                  }`}>
                    {row.value}
                  </span>
                ) : (
                  <span className={`text-xs text-white ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
