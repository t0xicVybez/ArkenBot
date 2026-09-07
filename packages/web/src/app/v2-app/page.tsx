'use client';

import { Users, MessageSquare, Shield, ScrollText, UserPlus, Bot, Star } from 'lucide-react';
import { AppShell } from '../../components/shell/AppShell';
import { StatTile } from '../../components/ui';

const FEATURES: [string, boolean][] = [
  ['Moderation', true],
  ['Auto-Mod', true],
  ['Leveling', true],
  ['Welcome', true],
  ['Logging', true],
  ['Music', true],
  ['Tickets', true],
  ['Economy', false],
];

export default function V2App() {
  return (
    <AppShell activeKey="overview" breadcrumb={['Ronin Empire', 'Overview']}>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-6">
        <div>
          <h1 className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            Good evening, RagingTrucker
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
            Here&rsquo;s what happened in Ronin Empire over the last 24 hours.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatTile icon={<Users className="h-4 w-4" />} label="Members" value="1,284" trend="▲ 12 this week" />
          <StatTile icon={<MessageSquare className="h-4 w-4" />} label="Messages · 24h" value="8,214" trend="▲ 6%" />
          <StatTile icon={<Shield className="h-4 w-4" />} label="Mod Actions" value="3" trend="— steady" trendTone="flat" />
          <StatTile icon={<ScrollText className="h-4 w-4" />} label="Log Events" value="214" trend="▲ 18%" />
        </div>

        <div className="grid grid-cols-[1.55fr_1fr] gap-5">
          {/* activity chart */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-[18px]">
            <div className="mb-3.5 flex items-center gap-2.5">
              <h3 className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                Message activity
              </h3>
              <span className="rounded-[var(--r-pill)] border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                Last 14 days
              </span>
            </div>
            <svg viewBox="0 0 900 240" className="h-[240px] w-full">
              <defs>
                <linearGradient id="ov-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="var(--border)">
                <line x1="0" y1="60" x2="900" y2="60" />
                <line x1="0" y1="120" x2="900" y2="120" />
                <line x1="0" y1="180" x2="900" y2="180" />
              </g>
              <path
                d="M0,175 C60,160 90,120 150,130 C210,140 240,95 300,105 C360,115 390,150 450,140 C510,130 540,80 600,70 C660,60 690,110 750,100 C810,92 840,60 900,55 L900,240 L0,240 Z"
                fill="url(#ov-g)"
              />
              <path
                d="M0,175 C60,160 90,120 150,130 C210,140 240,95 300,105 C360,115 390,150 450,140 C510,130 540,80 600,70 C660,60 690,110 750,100 C810,92 840,60 900,55"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
              />
              <circle cx="600" cy="70" r="4" fill="var(--accent)" stroke="var(--bg-card)" strokeWidth="2" />
            </svg>
          </div>

          {/* feature health + live feed */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-[18px]">
            <div className="mb-3 flex items-center">
              <h3 className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                Feature health
              </h3>
              <span className="ml-auto rounded-[var(--r-pill)] border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                8 / 8 core on
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {FEATURES.map(([name, on]) => (
                <div key={name} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className="h-[7px] w-[7px] flex-none rounded-full"
                    style={{
                      background: on ? 'var(--accent)' : '#3a3f4a',
                      boxShadow: on ? '0 0 8px var(--accent)' : 'none',
                    }}
                  />
                  {name}
                  <span
                    className="ml-auto text-[10.5px] font-semibold"
                    style={{ color: on ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {on ? 'On' : 'Off'}
                  </span>
                </div>
              ))}
            </div>

            <div className="my-3.5 border-t border-[var(--border)]" />
            <h3 className="mb-2 text-[14px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              Live activity
            </h3>
            <div className="flex flex-col gap-1">
              {[
                { icon: UserPlus, text: <><b className="font-semibold">nova_dev</b> joined the server</>, time: '2m' },
                { icon: Bot, text: 'AutoMod removed a phishing link', time: '14m' },
                { icon: Star, text: <><b className="font-semibold">#general</b> message hit the starboard</>, time: '31m' },
              ].map((e, i) => {
                const Icon = e.icon;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-[9px] px-1.5 py-2 hover:bg-[var(--bg-hover)]">
                    <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-[13px]">{e.text}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{e.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
