'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

/**
 * Small status donut on the tickets overview. Isolated so recharts loads in its
 * own lazy chunk (via next/dynamic in the page) rather than the route's initial JS.
 */
export default function StatusPie({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width={100} height={100}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={46} dataKey="value" strokeWidth={0}>
          {data.map((e, i) => <Cell key={i} fill={e.color} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
