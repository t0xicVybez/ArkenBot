'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { AppShell } from '../../../components/shell/AppShell';

// recharts is heavy; load each chart in its own chunk on demand.
const GrowthChart = dynamic(() => import('./_charts').then((m) => m.GrowthChart), { ssr: false, loading: () => <ChartSkeleton height={260} /> });
const ActivityChart = dynamic(() => import('./_charts').then((m) => m.ActivityChart), { ssr: false, loading: () => <ChartSkeleton height={190} /> });
const FeaturePie = dynamic(() => import('./_charts').then((m) => m.FeaturePie), { ssr: false, loading: () => <ChartSkeleton height={130} /> });
import { StatTile, ChartCard, Tabs } from '../../../components/ui';

const growth = [
  { d: 'Aug 10', m: 1243 }, { d: 'Aug 13', m: 1249 }, { d: 'Aug 16', m: 1255 },
  { d: 'Aug 19', m: 1258 }, { d: 'Aug 22', m: 1262 }, { d: 'Aug 25', m: 1268 },
  { d: 'Aug 28', m: 1274 }, { d: 'Aug 31', m: 1279 }, { d: 'Sep 3', m: 1282 }, { d: 'Sep 6', m: 1284 },
];
const activity = [
  { d: 'Mon', msgs: 620, cmds: 120 }, { d: 'Tue', msgs: 742, cmds: 98 },
  { d: 'Wed', msgs: 560, cmds: 110 }, { d: 'Thu', msgs: 480, cmds: 70 },
  { d: 'Fri', msgs: 690, cmds: 130 }, { d: 'Sat', msgs: 610, cmds: 90 }, { d: 'Sun', msgs: 520, cmds: 80 },
];
const byFeature = [
  { name: 'Leveling', value: 46, color: '#34d399' },
  { name: 'Tickets', value: 28, color: '#818cf8' },
  { name: 'Music', value: 16, color: '#22d3ee' },
  { name: 'Other', value: 10, color: '#3a3f4a' },
];
const mostActive = [
  ['ragingtrucker', 6, 326, '#c94b6b'], ['phonicspider', 5, 250, '#3ba55d'],
  ['eisenherz4247', 5, 222, '#8a5cf6'], ['na_kor', 5, 206, '#e0a53b'], ['zarlus', 3, 97, '#4aa8d8'],
] as const;

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-[3px]" style={{ background: c }} />;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'year'>('30d');

  return (
    <AppShell activeKey="analytics" breadcrumb={['Ronin Empire', 'Analytics']}>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-6">
        <div className="flex items-end">
          <div>
            <h1 className="text-[23px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              Analytics
            </h1>
            <p className="mt-1 text-[13.5px] text-(--text-secondary)">
              Growth, activity and moderation trends across the last 30 days.
            </p>
          </div>
          <div className="ml-auto">
            <Tabs
              value={range}
              onValueChange={setRange}
              options={[
                { value: '7d', label: '7d' }, { value: '30d', label: '30d' },
                { value: '90d', label: '90d' }, { value: 'year', label: 'Year' },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatTile label="Members" value="1,284" trend="▲ 3.2%" />
          <StatTile label="Net growth" value="+41" trend="▲ 12 vs prev" />
          <StatTile label="Messages" value="184.2k" trend="▲ 6.1%" />
          <StatTile label="Retention · 30d" value="88%" trend="▲ 2 pts" />
        </div>

        <ChartCard
          title="Member growth"
          right={<span className="flex items-center gap-1.5 text-[11.5px] text-(--text-secondary)"><Dot c="#34d399" /> Total members</span>}
        >
          <GrowthChart data={growth} />
        </ChartCard>

        <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-5">
          <ChartCard
            title="Activity"
            right={
              <span className="flex items-center gap-3 text-[11.5px] text-(--text-secondary)">
                <span className="flex items-center gap-1.5"><Dot c="#34d399" /> Msgs</span>
                <span className="flex items-center gap-1.5"><Dot c="#818cf8" /> Cmds</span>
              </span>
            }
          >
            <ActivityChart data={activity} />
          </ChartCard>

          <ChartCard title="By feature">
            <div className="flex items-center gap-4">
              <FeaturePie data={byFeature} />
              <div className="flex flex-1 flex-col gap-2 text-[12.5px] text-(--text-secondary)">
                {byFeature.map((e) => (
                  <div key={e.name} className="flex items-center gap-2">
                    <Dot c={e.color} />
                    {e.name}
                    <b className="ml-auto text-(--text-primary)" style={{ fontFamily: 'var(--font-display)' }}>
                      {e.value}%
                    </b>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Most active members">
            <div className="flex flex-col">
              {mostActive.map(([name, lvl, msgs, color], i) => (
                <div key={name} className="flex items-center gap-3 border-t border-(--border) py-[9px] text-[13px] first:border-t-0">
                  <span className="w-4 text-[12px] text-(--text-muted)" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                  <span className="h-[26px] w-[26px] rounded-full" style={{ background: color }} />
                  {name}
                  <span className="ml-auto rounded-[6px] bg-(--accent-soft) px-[7px] py-0.5 text-[11px] font-semibold text-(--accent)">
                    Lv {lvl}
                  </span>
                  <span className="w-[52px] text-right text-[13px] text-(--text-secondary)" style={{ fontFamily: 'var(--font-display)' }}>
                    {msgs}
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
