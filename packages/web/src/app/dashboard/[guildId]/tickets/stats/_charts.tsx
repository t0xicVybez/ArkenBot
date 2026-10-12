'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';

type T = (key: string, values?: Record<string, string | number>) => string;
type PieDatum = { name: string; value: number; color: string };

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-gray-300 mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Opened-vs-closed daily bar chart. */
export function DailyBarChart({ data, t }: { data: { date: string; opened: number; closed: number }[]; t: T }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }}
        />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="opened" name={t('opened')} fill="#5865f2" radius={[3, 3, 0, 0]} />
        <Bar dataKey="closed" name={t('statusClosed')} fill="#57f287" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut breakdown (status or per-panel). */
export function BreakdownPie({ data }: { data: PieDatum[] }) {
  return (
    <ResponsiveContainer width={160} height={160}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Rating distribution bar chart. */
export function RatingBarChart({ data, t }: { data: { star: string; count: number }[]; t: T }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="star" tick={{ fill: '#9ca3af', fontSize: 13 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" name={t('ratings')} fill="#fee75c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
