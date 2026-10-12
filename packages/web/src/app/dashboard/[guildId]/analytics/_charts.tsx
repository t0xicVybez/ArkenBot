'use client';
/**
 * Lazily-loaded analytics charts (recharts, code-split so recharts loads on demand).
 */

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type HistPoint = {
  date: string;
  memberCount: number;
  messagesCount: number;
  commandsCount: number;
  newMembers: number;
  leftMembers: number;
};
type ModPoint = { date: string; ban: number; kick: number; mute: number; warn: number };
type T = (key: string, values?: Record<string, string | number>) => string;

const tooltip = { contentStyle: { background: '#1e2124', border: '1px solid #374151', borderRadius: 6 } };
const axis = { tick: { fill: '#9ca3af', fontSize: 11 } };

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="card">
      <h3 className="text-base font-semibold text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>{children}</ResponsiveContainer>
    </div>
  );
}

export default function AnalyticsCharts({ history, modTrend, t }: { history: HistPoint[]; modTrend: ModPoint[]; t: T }) {
  return (
    <>
      <ChartCard title={t('memberGrowth')}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" {...axis} /><YAxis {...axis} /><Tooltip {...tooltip} />
          <Line type="monotone" dataKey="memberCount" stroke="#5865f2" strokeWidth={2} dot={false} name={t('seriesMembers')} />
        </LineChart>
      </ChartCard>

      <ChartCard title={t('activity')}>
        <BarChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" {...axis} /><YAxis {...axis} /><Tooltip {...tooltip} />
          <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
          <Bar dataKey="messagesCount" fill="#5865f2" name={t('seriesMessages')} radius={[2, 2, 0, 0]} />
          <Bar dataKey="commandsCount" fill="#57f287" name={t('seriesCommands')} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title={t('memberFlow')}>
        <BarChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" {...axis} /><YAxis {...axis} /><Tooltip {...tooltip} />
          <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
          <Bar dataKey="newMembers" fill="#57f287" name={t('seriesJoins')} radius={[2, 2, 0, 0]} />
          <Bar dataKey="leftMembers" fill="#ed4245" name={t('seriesLeaves')} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartCard>

      {modTrend.length > 0 && (
        <ChartCard title={t('moderationTrends')}>
          <BarChart data={modTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tooltip} />
            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
            <Bar dataKey="ban" stackId="m" fill="#ed4245" name={t('seriesBans')} />
            <Bar dataKey="kick" stackId="m" fill="#faa61a" name={t('seriesKicks')} />
            <Bar dataKey="mute" stackId="m" fill="#f1c40f" name={t('seriesMutes')} />
            <Bar dataKey="warn" stackId="m" fill="#5865f2" name={t('seriesWarns')} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartCard>
      )}
    </>
  );
}
