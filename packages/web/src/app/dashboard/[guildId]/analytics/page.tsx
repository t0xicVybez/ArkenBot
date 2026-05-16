'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';

type DailyStats = {
  date: string;
  memberCount: number;
  messagesCount: number;
  commandsCount: number;
  newMembers: number;
  leftMembers: number;
};

type AnalyticsData = {
  moderationActions24h: number;
  newMembers24h: number;
  leftMembers24h: number;
  history: DailyStats[];
};

export default function AnalyticsPage() {
  const { guildId } = useParams() as { guildId: string };

  const { data: res, isLoading } = useQuery({
    queryKey: ['analytics', guildId],
    queryFn: () => api.get(`/guilds/${guildId}/analytics`),
    refetchInterval: 5 * 60 * 1000,
  });

  const data: AnalyticsData = (res?.data as { data?: AnalyticsData })?.data ?? {
    moderationActions24h: 0,
    newMembers24h: 0,
    leftMembers24h: 0,
    history: [],
  };

  const history = data.history.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  const statCards = [
    { label: 'New Members (24h)', value: data.newMembers24h, color: 'text-green-400' },
    { label: 'Left Members (24h)', value: data.leftMembers24h, color: 'text-red-400' },
    { label: 'Mod Actions (24h)', value: data.moderationActions24h, color: 'text-yellow-400' },
  ];

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <LineChartIcon className="w-6 h-6 text-discord-blurple" />
        <h1 className="text-2xl font-bold text-white">Server Analytics</h1>
      </div>

      {/* 24h stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="card text-center">
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {history.length === 0 ? (
        <div className="card text-center py-12 text-gray-500 text-sm">
          No historical data yet. Analytics data is collected daily and will appear here after the first full day.
        </div>
      ) : (
        <>
          {/* Member count over time */}
          <div className="card">
            <h3 className="text-base font-semibold text-white mb-4">Member Growth (30 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e2124', border: '1px solid #374151', borderRadius: 6 }} />
                <Line type="monotone" dataKey="memberCount" stroke="#5865f2" strokeWidth={2} dot={false} name="Members" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Messages & commands */}
          <div className="card">
            <h3 className="text-base font-semibold text-white mb-4">Activity (30 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e2124', border: '1px solid #374151', borderRadius: 6 }} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="messagesCount" fill="#5865f2" name="Messages" radius={[2, 2, 0, 0]} />
                <Bar dataKey="commandsCount" fill="#57f287" name="Commands" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Joins vs leaves */}
          <div className="card">
            <h3 className="text-base font-semibold text-white mb-4">Member Flow (30 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e2124', border: '1px solid #374151', borderRadius: 6 }} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="newMembers" fill="#57f287" name="Joins" radius={[2, 2, 0, 0]} />
                <Bar dataKey="leftMembers" fill="#ed4245" name="Leaves" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
