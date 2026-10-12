'use client';

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const tipStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
} as const;
const axisTick = { fill: 'var(--text-muted)', fontSize: 11 } as const;

/**
 * v2 analytics charts. Isolated so recharts loads in its own lazy chunk (via
 * next/dynamic in the page) rather than the route's initial JS.
 */
export function GrowthChart({ data }: { data: { d: string; m: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="d" tick={axisTick} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} domain={['dataMin-8', 'dataMax+4']} />
        <Tooltip contentStyle={tipStyle} cursor={{ stroke: 'var(--border-strong)' }} />
        <Area type="monotone" dataKey="m" name="Members" stroke="#34d399" strokeWidth={2.5} fill="url(#mg)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ActivityChart({ data }: { data: { d: string; msgs: number; cmds: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="d" tick={axisTick} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} />
        <Tooltip contentStyle={tipStyle} cursor={{ fill: 'var(--bg-hover)' }} />
        <Bar dataKey="msgs" name="Messages" fill="#34d399" radius={[3, 3, 0, 0]} />
        <Bar dataKey="cmds" name="Commands" fill="#818cf8" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FeaturePie({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width={130} height={130}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={62} paddingAngle={2} stroke="none">
          {data.map((e) => <Cell key={e.name} fill={e.color} />)}
        </Pie>
        <Tooltip contentStyle={tipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
