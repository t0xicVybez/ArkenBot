'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { BarChart3, X } from 'lucide-react';

const MemoryChart = dynamic(() => import('./_charts'), { ssr: false, loading: () => <ChartSkeleton height={192} /> });
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useWebSocket } from '@/lib/socket';

export default function StaffMetricsPage() {
  const t = useTranslations('staffMetrics');
  const queryClient = useQueryClient();
  const [memHistory, setMemHistory] = useState<Array<{ time: string; value: number }>>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [rawMetrics, setRawMetrics] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);

  const { data: statsRes } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats(),
    refetchInterval: 30000,
  });

  useWebSocket('bot:ready', () => queryClient.invalidateQueries({ queryKey: ['admin-stats'] }));

  const stats = statsRes?.data?.data;

  useEffect(() => {
    const mem = stats?.memoryUsage;
    if (mem != null) {
      const now = new Date().toLocaleTimeString();
      setMemHistory((prev) => [...prev.slice(-29), { time: now, value: mem }]);
    }
  }, [stats?.memoryUsage]);

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><BarChart3 className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {}
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">{t('memoryChart')}</h3>
          <div className="h-48">
            <MemoryChart data={memHistory} />
          </div>
        </div>

        {}
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">{t('currentStats')}</h3>
          <dl className="space-y-3">
            {[
              { label: t('totalGuilds'), value: stats?.totalGuilds ?? '—' },
              { label: t('activeGuilds'), value: stats?.activeGuilds ?? '—' },
              { label: t('totalUsers'), value: stats?.totalUsers ?? '—' },
              { label: t('memoryUsage'), value: stats?.memoryUsage ? `${stats.memoryUsage} MB` : '—' },
              { label: t('uptime'), value: stats?.uptime ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m` : '—' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-1 border-b border-(--border-subtle)">
                <dt className="text-gray-400 text-sm">{item.label}</dt>
                <dd className="text-white font-mono text-sm">{String(item.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-gray-600 mt-3">{t('updatesEvery')}</p>
        </div>
      </div>

      {}
      <div className="card mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">{t('prometheusTitle')}</h3>
        <p className="text-gray-400 text-sm mb-3">
          {t('prometheusDesc')}
        </p>
        <button
          className="btn-secondary text-sm"
          disabled={rawLoading}
          onClick={async () => {
            setRawLoading(true);
            try {
              const res = await adminApi.getMetrics();
              setRawMetrics(res.data as unknown as string);
              setShowRaw(true);
            } finally {
              setRawLoading(false);
            }
          }}
        >
          {rawLoading ? t('loading') : t('viewRaw')}
        </button>
      </div>

      {}
      {showRaw && rawMetrics && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-discord-dark-bg border border-gray-700 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-white font-semibold">{t('rawModalTitle')}</h2>
              <button onClick={() => setShowRaw(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="p-4 text-xs text-gray-300 font-mono overflow-auto flex-1 whitespace-pre-wrap break-all">
              {rawMetrics}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
