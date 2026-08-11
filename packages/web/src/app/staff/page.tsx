'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Server, Users, Puzzle, Shield, LayoutGrid, ArrowRight } from 'lucide-react';
import type { SystemStats } from '@arkenbot/shared';
import { useTranslations } from 'next-intl';
import { useWebSocket } from '@/lib/socket';

/** Mock-pattern stat tile: uppercase label, big tabular value. */
function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-4 pt-[15px] pb-3">
      <p className="text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)] font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white leading-tight tracking-tight tabular mt-[3px]">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export default function StaffDashboard() {
  const t = useTranslations('staffDashboard');
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
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  };

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <div className="page-head">
        <div className="page-head-icon"><LayoutGrid className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Stat tiles */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl h-[76px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          <StatTile label={t('servers')} value={stats?.totalGuilds ?? 0} />
          <StatTile label={t('activeServers')} value={stats?.activeGuilds ?? 0} />
          <StatTile label={t('totalUsers')} value={stats?.totalUsers ?? 0} />
          <StatTile label={t('modCases')} value={stats?.totalCases ?? 0} />
          <StatTile label={t('activeWarnings')} value={stats?.totalWarnings ?? 0} />
          <StatTile label={t('addons')} value={stats?.totalAddons ?? 0} />
          <StatTile label={t('uptime')} value={stats?.uptime ? formatUptime(stats.uptime) : '—'} />
          <StatTile label={t('memory')} value={stats?.memoryUsage ? `${stats.memoryUsage} MB` : '—'} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick actions */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-0 overflow-hidden">
          <div className="px-[18px] py-[13px] border-b border-[var(--border-subtle)]">
            <h2 className="text-[13.5px] font-bold text-white">{t('quickActions')}</h2>
          </div>
          <div>
            {[
              { href: '/staff/guilds', icon: Server, label: t('browseGuilds'), sub: t('browseGuildsSub') },
              { href: '/staff/users', icon: Users, label: t('manageUsers'), sub: t('manageUsersSub') },
              { href: '/staff/addons', icon: Puzzle, label: t('addonRegistry'), sub: t('addonRegistrySub') },
              { href: '/staff/logs', icon: Shield, label: t('systemLogs'), sub: t('systemLogsSub') },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 px-[18px] py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-white/[0.02] transition-colors group"
              >
                <span className="w-[34px] h-[34px] rounded-[9px] bg-[var(--bg-elevated)] grid place-items-center flex-shrink-0">
                  <action.icon className="w-4 h-4 text-[var(--accent)]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold text-gray-200 group-hover:text-white transition-colors">{action.label}</span>
                  <span className="block text-[12px] text-[var(--text-muted)] truncate">{action.sub}</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>

        {/* System health */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-0 overflow-hidden">
          <div className="flex items-center px-[18px] py-[13px] border-b border-[var(--border-subtle)]">
            <h2 className="text-[13.5px] font-bold text-white">{t('systemHealth')}</h2>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/30">
              <span className="w-[7px] h-[7px] rounded-full bg-[var(--success)]" />
              {t('operational')}
            </span>
          </div>
          <div className="px-[18px]">
            {[
              { label: t('healthBot'), value: stats?.totalGuilds != null ? t('serversValue', { count: stats.totalGuilds }) : '—' },
              { label: t('healthApi'), value: stats?.uptime ? t('upValue', { uptime: formatUptime(stats.uptime) }) : '—' },
              { label: t('healthVersion'), value: stats?.version ?? '1.0.0', mono: true },
              { label: t('healthMemory'), value: stats?.memoryUsage ? t('memoryHeap', { mb: stats.memoryUsage }) : '—' },
              { label: t('healthEnvironment'), value: process.env.NODE_ENV ?? 'development' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2.5 py-3 border-b border-[var(--border-subtle)] last:border-0">
                <span className="w-[7px] h-[7px] rounded-full bg-[var(--success)] flex-shrink-0" />
                <span className="text-[13px] font-semibold text-gray-200">{row.label}</span>
                <span className={`ml-auto text-[12px] text-[var(--text-muted)] ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
