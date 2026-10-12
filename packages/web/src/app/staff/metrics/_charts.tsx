'use client';
/**
 * Lazily-loaded staff memory-usage chart (recharts, code-split).
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MemoryChart({ data }: { data: Array<{ time: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="time" tick={{ fill: '#6B7280', fontSize: 10 }} interval="preserveEnd" />
        <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: '#2F3136', border: '1px solid #374151', borderRadius: 6 }}
          labelStyle={{ color: '#9CA3AF' }}
          itemStyle={{ color: '#5865F2' }}
        />
        <Line type="monotone" dataKey="value" stroke="#5865F2" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
