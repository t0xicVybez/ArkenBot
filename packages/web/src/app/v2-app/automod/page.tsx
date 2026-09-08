'use client';

import { useState } from 'react';
import { Filter, Zap, Link2Off, Sparkles } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { SettingCard, Switch, Select, LivePreview, Badge, Toast } from '../../../components/ui';

const DEFAULTS = { word: true, spam: true, phish: true, ai: false, threshold: 6, action: 'timeout' };

export default function AutoModPage() {
  const [s, setS] = useState({ ...DEFAULTS });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };
  const save = () => {
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };
  const discard = () => {
    setS({ ...DEFAULTS });
    setDirty(false);
  };

  return (
    <AppShell
      activeKey="automod"
      breadcrumb={['Ronin Empire', 'Safety', 'Auto-Mod']}
      dirty={dirty}
      onSave={save}
      onDiscard={discard}
    >
      <div className="mx-auto grid max-w-[1100px] grid-cols-[1.5fr_1fr] gap-5 p-6 pb-24">
        {/* settings column */}
        <div className="flex flex-col gap-3.5">
          <div>
            <h1 className="text-[23px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              Auto-Moderation
            </h1>
            <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
              Automatically scan messages and act on spam, filtered words, and malicious links.
            </p>
          </div>

          <SettingCard
            icon={<Filter className="h-[19px] w-[19px]" />}
            title="Word & phrase filter"
            description="Delete messages containing blocked words, then warn — escalating to timeout on repeat."
            control={<Switch checked={s.word} onChange={(v) => set('word', v)} />}
          >
            <div className="text-[12px] font-semibold text-[var(--text-secondary)]">Blocked terms · 12</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['scam', 'free nitro', 'airdrop'].map((t) => (
                <span
                  key={t}
                  className="rounded-[7px] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[12px]"
                >
                  {t}
                </span>
              ))}
              <span className="rounded-[7px] border border-dashed border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-muted)]">
                + Add term
              </span>
            </div>
          </SettingCard>

          <SettingCard
            icon={<Zap className="h-[19px] w-[19px]" />}
            title="Anti-spam & flood"
            description="Trigger when a member sends too many messages in a short window."
            control={<Switch checked={s.spam} onChange={(v) => set('spam', v)} />}
          >
            <div className="text-[12px] font-semibold text-[var(--text-secondary)]">
              Threshold · {s.threshold} messages / 5s
            </div>
            <input
              type="range"
              min={2}
              max={20}
              value={s.threshold}
              onChange={(e) => set('threshold', Number(e.target.value))}
              className="mt-3 w-full"
              style={{ accentColor: 'var(--accent)' }}
            />
            <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
              <span>Relaxed</span>
              <span>Strict</span>
            </div>
          </SettingCard>

          <SettingCard
            icon={<Link2Off className="h-[19px] w-[19px]" />}
            title="Phishing link filter"
            description="Detect and remove known scam / phishing domains automatically."
            control={<Switch checked={s.phish} onChange={(v) => set('phish', v)} />}
          >
            <div className="mb-2 text-[12px] font-semibold text-[var(--text-secondary)]">On detection</div>
            <Select value={s.action} onChange={(e) => set('action', e.target.value)}>
              <option value="delete">Delete message</option>
              <option value="timeout">Delete message + timeout 10 min</option>
              <option value="ban">Delete message + ban</option>
            </Select>
          </SettingCard>

          <SettingCard
            icon={<Sparkles className="h-[19px] w-[19px]" />}
            title={
              <span className="flex items-center gap-2">
                AI toxicity check <Badge tone="info">Add-on</Badge>
              </span>
            }
            description="Flag harassment and hate with an AI classifier before it escalates."
            control={<Switch checked={s.ai} onChange={(v) => set('ai', v)} />}
          />
        </div>

        {/* live preview */}
        <div>
          <div className="sticky top-0">
            <LivePreview>
              <div className="rounded-[10px] bg-[#141517] p-3.5 text-[13px]">
                <div className="mb-3.5 flex gap-2.5">
                  <span className="h-[34px] w-[34px] flex-none rounded-full" style={{ background: '#a24bd6' }} />
                  <div>
                    <div>
                      <span className="font-bold">riskyuser</span>
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">Today at 4:02 PM</span>
                    </div>
                    <div className="mt-0.5 text-[#b8bcc4]">
                      <span className="text-[#6b7178] line-through">
                        check out this free nitro discordn1tro.ru/gift
                      </span>{' '}
                      <span className="text-[12px] italic text-[#6b7178]">[removed by AutoMod]</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <span
                    className="h-[34px] w-[34px] flex-none rounded-full"
                    style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-2))' }}
                  />
                  <div className="flex-1">
                    <div>
                      <span className="font-bold">ArkenBot</span>
                      <span className="ml-1.5 rounded-[4px] bg-[#5865f2] px-1.5 py-px text-[9.5px] font-bold text-white">
                        APP
                      </span>
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">Today at 4:02 PM</span>
                    </div>
                    <div className="mt-1.5 rounded-[6px] border-l-[3px] border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2.5">
                      <div className="text-[13px] font-semibold text-[#ffd7d7]">Message removed · @riskyuser</div>
                      <div className="mt-0.5 text-[12px] text-[#c9a3a3]">
                        {s.phish ? 'Filtered word + phishing link' : 'Filtered word'} · violation #1.
                        {s.action === 'ban' ? ' User banned.' : s.action === 'timeout' ? ' 10-min timeout applied.' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                This is exactly what members and your mod-log will see with the current settings.
              </p>
            </LivePreview>
          </div>
        </div>
      </div>
      <Toast show={saved} message="Auto-Mod settings saved" />
    </AppShell>
  );
}
