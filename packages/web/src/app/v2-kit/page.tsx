'use client';

import { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  Input,
  Select,
  Switch,
  Tabs,
  Avatar,
  Kbd,
  Skeleton,
  Tooltip,
  StatTile,
  SettingCard,
} from '../../components/ui';

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="7" width="16" height="12" rx="3" />
    <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    <circle cx="9" cy="13" r="1" />
    <circle cx="15" cy="13" r="1" />
  </svg>
);
const UsersIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20a6 6 0 0 1 12 0" />
  </svg>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--border)] pt-6">
      <div
        className="text-[11px] tracking-[1.4px] uppercase font-bold text-[var(--text-muted)] mb-4"
      >
        {title}
      </div>
      {children}
    </section>
  );
}

export default function V2Kit() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [tab, setTab] = useState<'7d' | '30d' | '90d'>('30d');

  return (
    <div className="v2 min-h-screen" data-theme={theme} style={{ background: 'var(--bg-surface)' }}>
      <div className="max-w-[960px] mx-auto px-8 py-10 flex flex-col gap-8">
        {/* header */}
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-[11px] grid place-items-center font-bold text-[var(--accent-contrast)]"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', fontFamily: 'var(--font-display)' }}
          >
            A
          </div>
          <div className="flex-1">
            <h1 className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              ArkenBot v2 — Component Kit
            </h1>
            <div className="text-[13px] text-[var(--text-secondary)]">
              Phase 1 foundations · emerald · Space Grotesk / Manrope / JetBrains Mono
            </div>
          </div>
          <Tabs
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </div>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="primary">Save changes</Button>
            <Button variant="secondary">Discard</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="lg">Large</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-3 items-center">
            <Badge tone="accent">On</Badge>
            <Badge tone="info">Add-on</Badge>
            <Badge tone="warning">Beta</Badge>
            <Badge tone="danger">Action required</Badge>
            <Badge tone="neutral">Neutral</Badge>
          </div>
        </Section>

        <Section title="Switch · Input · Select">
          <div className="grid grid-cols-2 gap-6 max-w-[640px]">
            <div className="flex items-center gap-4">
              <Switch checked={sw1} onChange={setSw1} />
              <Switch checked={sw2} onChange={setSw2} />
              <span className="text-[13px] text-[var(--text-secondary)]">controlled</span>
            </div>
            <Tabs
              value={tab}
              onValueChange={setTab}
              options={[
                { value: '7d', label: '7d' },
                { value: '30d', label: '30d' },
                { value: '90d', label: '90d' },
              ]}
            />
            <Input placeholder="Search terms…" />
            <Select defaultValue="delete">
              <option value="delete">Delete message</option>
              <option value="timeout">Delete + timeout</option>
              <option value="ban">Delete + ban</option>
            </Select>
          </div>
        </Section>

        <Section title="Avatar · Kbd · Tooltip · Skeleton">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Avatar initials="RE" />
              <Avatar initials="A" size={40} />
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
              Press <Kbd>⌘</Kbd> <Kbd>K</Kbd>
            </div>
            <Tooltip label="This is a tooltip">
              <Button variant="secondary" size="sm">Hover me</Button>
            </Tooltip>
            <div className="flex flex-col gap-2 w-[180px]">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </Section>

        <Section title="Stat tiles">
          <div className="grid grid-cols-4 gap-4">
            <StatTile icon={<UsersIcon />} label="Members" value="1,284" trend="▲ 12 this week" />
            <StatTile label="Messages · 24h" value="8,214" trend="▲ 6%" />
            <StatTile label="Mod Actions" value="3" trend="— steady" trendTone="flat" />
            <StatTile label="Left · 24h" value="1" trend="▼ 2" trendTone="down" />
          </div>
        </Section>

        <Section title="Setting card">
          <SettingCard
            icon={<ShieldIcon />}
            title="Word & phrase filter"
            description="Delete messages containing blocked words, then warn — escalating to timeout on repeat."
            control={<Switch checked={sw1} onChange={setSw1} />}
          >
            <div className="flex flex-wrap gap-2">
              {['scam', 'free nitro', 'airdrop'].map((t) => (
                <span
                  key={t}
                  className="text-[12px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[7px] px-2.5 py-1"
                >
                  {t}
                </span>
              ))}
              <span className="text-[12px] text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-[7px] px-2.5 py-1">
                + Add term
              </span>
            </div>
          </SettingCard>
        </Section>

        <Section title="Card">
          <Card>
            <h3 className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              A plain card
            </h3>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              The base surface every panel is built on — tokenized background, border, radius and padding.
            </p>
          </Card>
        </Section>
      </div>
    </div>
  );
}
