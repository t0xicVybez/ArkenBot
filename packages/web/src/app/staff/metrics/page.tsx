'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWebSocket } from '@/lib/socket';

export default function StaffMetricsPage() {
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

  // Build memory history
  useEffect(() => {
    if (stats?.memoryUsage) {
      const now = new Date().toLocaleTimeString();
      setMemHistory((prev) => [...prev.slice(-29), { time: now, value: stats.memoryUsage }]);
    }
  }, [stats?.memoryUsage]);

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><BarChart3 className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>System Metrics</h1>
          <div className="page-head-desc">Usage and performance across the fleet.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Memory Usage Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Memory Usage (MB)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={memHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#6B7280', fontSize: 10 }}
                  interval="preserveEnd"
                />
                <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#2F3136', border: '1px solid #374151', borderRadius: 6 }}
                  labelStyle={{ color: '#9CA3AF' }}
                  itemStyle={{ color: '#5865F2' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#5865F2"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Current Stats */}
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Current Stats</h3>
          <dl className="space-y-3">
            {[
              { label: 'Total Guilds', value: stats?.totalGuilds ?? '—' },
              { label: 'Active Guilds', value: stats?.activeGuilds ?? '—' },
              { label: 'Total Users', value: stats?.totalUsers ?? '—' },
              { label: 'Memory Usage', value: stats?.memoryUsage ? `${stats.memoryUsage} MB` : '—' },
              { label: 'Uptime', value: stats?.uptime ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m` : '—' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                <dt className="text-gray-400 text-sm">{item.label}</dt>
                <dd className="text-white font-mono text-sm">{String(item.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-gray-600 mt-3">Updates every 30 seconds</p>
        </div>
      </div>

      {/* Prometheus Metrics */}
      <div className="card mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">Prometheus Metrics</h3>
        <p className="text-gray-400 text-sm mb-3">
          Raw Prometheus metrics for scraping with Grafana or Prometheus.
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
          {rawLoading ? 'Loading…' : 'View Raw Metrics →'}
        </button>
      </div>

      {/* Raw metrics modal */}
      {showRaw && rawMetrics && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-discord-dark-bg border border-gray-700 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-white font-semibold">Raw Prometheus Metrics</h2>
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
