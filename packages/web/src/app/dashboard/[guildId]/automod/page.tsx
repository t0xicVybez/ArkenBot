'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import type { AutoModConfig } from '@arkenbot/shared';
import { Bot, X, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ─── Filter-type label map ────────────────────────────────────────────────────
const FILTER_LABELS: Record<string, string> = {
  'Word filter violation': 'Word Filter',
  'Spam detected':         'Anti-Spam',
  'Link detected':         'Anti-Link',
  'Mention spam':          'Anti-Mention',
  'Caps spam':             'Anti-Caps',
  'Raid detected':         'Anti-Raid',
};

// ─── Automod analytics panel ──────────────────────────────────────────────────
function AutoModStats({ guildId }: { guildId: string }) {
  const [days, setDays] = useState(14);

  const { data: res, isLoading } = useQuery({
    queryKey: ['automod-analytics', guildId, days],
    queryFn: () => guildsApi.automodAnalytics(guildId, days),
    refetchInterval: 60_000,
  });

  const analytics = res?.data?.data as {
    total: number;
    byFilter: Record<string, number>;
    byAction: Record<string, number>;
    timeseries: { date: string; hits: number }[];
  } | undefined;

  if (isLoading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5 mb-6 animate-pulse h-48" />
    );
  }

  if (!analytics) return null;

  const filterRows = Object.entries(analytics.byFilter).sort((a, b) => b[1] - a[1]);
  const chartData = analytics.timeseries.map((row) => ({
    date: new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Hits: row.hits,
  }));

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5 mb-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-discord-blurple" />
          <h2 className="text-sm font-semibold text-white">Hit Rate Analytics</h2>
          <span className="text-xs text-gray-500 font-normal">· {analytics.total} actions total</span>
        </div>
        <select
          className="input text-xs py-1 w-28"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {analytics.total === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">No automod actions in this period.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Time-series chart */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Actions per day</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e1f22', border: '1px solid #ffffff10', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  cursor={{ fill: '#5865F220' }}
                />
                <Bar dataKey="Hits" fill="#5865F2" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Filter breakdown */}
          <div>
            <p className="text-xs text-gray-500 mb-2">By filter type</p>
            <div className="space-y-1.5">
              {filterRows.map(([reason, count]) => {
                const label = FILTER_LABELS[reason] ?? reason;
                const pct = Math.round((count / analytics.total) * 100);
                return (
                  <div key={reason} className="flex items-center gap-2">
                    <span className="text-gray-300 text-xs w-28 truncate flex-shrink-0">{label}</span>
                    <div className="flex-1 bg-[var(--bg-base)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-discord-blurple rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-gray-400 text-xs w-8 text-right flex-shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GuildRole { id: string; name: string; color: number }
interface GuildChannel { id: string; name: string; type: number }

export default function AutoModPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Partial<AutoModConfig>>({});
  const [wordInput, setWordInput] = useState('');

  const { data: configRes } = useQuery({
    queryKey: ['automod', guildId],
    queryFn: () => settingsApi.getAutoMod(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const allRoles = (rolesRes?.data?.data ?? []) as GuildRole[];
  const textChannels = ((channelsRes?.data?.data ?? []) as GuildChannel[]).filter((c) => c.type === 0);

  useEffect(() => {
    if (configRes?.data?.data) {
      setConfig(configRes.data.data);
    }
  }, [configRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<AutoModConfig>) => settingsApi.updateAutoMod(guildId, data),
    onSuccess: () => {
      toast.success('Auto-Mod settings saved!');
      queryClient.invalidateQueries({ queryKey: ['automod', guildId] });
    },
    onError: () => toast.error('Failed to save settings.'),
  });

  const handleToggle = (key: keyof AutoModConfig, value: boolean) => {
    setConfig((c) => ({ ...c, [key]: value }));
    mutation.mutate({ [key]: value });
  };

  const handleSave = (partial: Partial<AutoModConfig>) => {
    mutation.mutate(partial);
  };

  const addWord = () => {
    const trimmed = wordInput.trim().toLowerCase();
    if (!trimmed) return;
    if ((config.filteredWords ?? []).includes(trimmed)) {
      toast.error(`"${trimmed}" is already in the filter`);
      setWordInput('');
      return;
    }
    const words = [...(config.filteredWords ?? []), trimmed];
    setConfig((c) => ({ ...c, filteredWords: words }));
    mutation.mutate({ filteredWords: words });
    setWordInput('');
  };

  const removeWord = (word: string) => {
    const words = (config.filteredWords ?? []).filter((w) => w !== word);
    setConfig((c) => ({ ...c, filteredWords: words }));
    mutation.mutate({ filteredWords: words });
  };

  const toggleExemptRole = (roleId: string) => {
    const current = config.exemptRoles ?? [];
    const next = current.includes(roleId) ? current.filter((r) => r !== roleId) : [...current, roleId];
    setConfig((c) => ({ ...c, exemptRoles: next }));
    mutation.mutate({ exemptRoles: next });
  };

  const toggleExemptChannel = (channelId: string) => {
    const current = config.exemptChannels ?? [];
    const next = current.includes(channelId) ? current.filter((c) => c !== channelId) : [...current, channelId];
    setConfig((c) => ({ ...c, exemptChannels: next }));
    mutation.mutate({ exemptChannels: next });
  };

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Bot className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Auto-Mod</h1>
          <div className="page-head-desc">Filters that act before your mods have to.</div>
        </div>
      </div>

      <AutoModStats guildId={guildId} />

      <SettingsSection title="Anti-Spam" description="Prevent message spam automatically.">
        <Toggle
          label="Enable Anti-Spam"
          enabled={config.antiSpamEnabled ?? false}
          onChange={(v) => handleToggle('antiSpamEnabled', v)}
        />
        {config.antiSpamEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">Messages Threshold</label>
              <input
                type="number"
                className="input"
                value={config.antiSpamThreshold ?? 5}
                min={2}
                max={20}
                onChange={(e) => setConfig((c) => ({ ...c, antiSpamThreshold: parseInt(e.target.value) }))}
                onBlur={() => handleSave({ antiSpamThreshold: config.antiSpamThreshold })}
              />
            </div>
            <div>
              <label className="label">Interval (ms)</label>
              <input
                type="number"
                className="input"
                value={config.antiSpamInterval ?? 5000}
                min={1000}
                max={30000}
                step={1000}
                onChange={(e) => setConfig((c) => ({ ...c, antiSpamInterval: parseInt(e.target.value) }))}
                onBlur={() => handleSave({ antiSpamInterval: config.antiSpamInterval })}
              />
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Word Filter"
        description="Block specific words or phrases. Messages are deleted and the user is warned — with escalation to timeout then kick on repeat violations."
      >
        <Toggle
          label="Enable Word Filter"
          enabled={config.filterEnabled ?? false}
          onChange={(v) => handleToggle('filterEnabled', v)}
        />
        {config.filterEnabled && (
          <div className="pt-2 space-y-4">
            {/* Word list */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Add a word..."
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addWord()}
                />
                <button onClick={addWord} className="btn-primary">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(config.filteredWords ?? []).map((word, i) => (
                  <span
                    key={`${word}-${i}`}
                    className="inline-flex items-center gap-1 bg-red-900/30 text-red-400 border border-red-700/50 rounded px-2 py-0.5 text-xs"
                  >
                    {word}
                    <button onClick={() => removeWord(word)} className="hover:text-red-300 ml-1">×</button>
                  </span>
                ))}
                {(config.filteredWords?.length ?? 0) === 0 && (
                  <p className="text-gray-500 text-xs">No words in filter</p>
                )}
              </div>
            </div>

            {/* Escalation thresholds */}
            <div className="border-t border-[var(--border-subtle)] pt-4">
              <p className="text-sm font-medium text-white mb-3">Escalation</p>
              <p className="text-xs text-gray-500 mb-3">
                Violations are tracked per-user over 24 hours. Each offense creates a warning.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Violations before timeout</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={20}
                    value={config.filterWarnBeforeTimeout ?? 3}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, filterWarnBeforeTimeout: parseInt(e.target.value) }))
                    }
                    onBlur={() => handleSave({ filterWarnBeforeTimeout: config.filterWarnBeforeTimeout })}
                  />
                </div>
                <div>
                  <label className="label">Timeout duration (seconds)</label>
                  <input
                    type="number"
                    className="input"
                    min={60}
                    max={2419200}
                    step={60}
                    value={config.filterTimeoutDuration ?? 300}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, filterTimeoutDuration: parseInt(e.target.value) }))
                    }
                    onBlur={() => handleSave({ filterTimeoutDuration: config.filterTimeoutDuration })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.ceil((config.filterTimeoutDuration ?? 300) / 60)} min
                  </p>
                </div>
                <div>
                  <label className="label">Violations before kick</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={30}
                    value={config.filterWarnBeforeKick ?? 5}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, filterWarnBeforeKick: parseInt(e.target.value) }))
                    }
                    onBlur={() => handleSave({ filterWarnBeforeKick: config.filterWarnBeforeKick })}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="mt-3 p-3 rounded bg-[var(--bg-card)] text-xs text-gray-400 space-y-1">
                <p>① 1–{(config.filterWarnBeforeTimeout ?? 3) - 1} violations → <span className="text-yellow-400">delete + warn</span></p>
                <p>② {config.filterWarnBeforeTimeout ?? 3}–{(config.filterWarnBeforeKick ?? 5) - 1} violations → <span className="text-orange-400">timeout ({Math.ceil((config.filterTimeoutDuration ?? 300) / 60)} min)</span></p>
                <p>③ {config.filterWarnBeforeKick ?? 5}+ violations → <span className="text-red-400">kick</span></p>
              </div>
            </div>

            {/* Custom messages */}
            <div className="border-t border-[var(--border-subtle)] pt-4 space-y-4">
              <p className="text-sm font-medium text-white">Messages</p>
              <p className="text-xs text-gray-500 -mt-2">
                Variables: <code className="text-gray-400">{'{user}'}</code> <code className="text-gray-400">{'{count}'}</code> <code className="text-gray-400">{'{server}'}</code>
              </p>
              <div>
                <label className="label">Warning / Timeout Message</label>
                <p className="text-xs text-gray-500 mb-1">Sent in channel when a violation is detected (warn or timeout stage)</p>
                <textarea
                  className="input min-h-[60px] resize-y font-mono text-sm"
                  value={config.filterWarnMessage ?? ''}
                  placeholder="⚠️ {user} Your message was removed for containing a filtered word (violation #{count})."
                  onChange={(e) => setConfig((c) => ({ ...c, filterWarnMessage: e.target.value }))}
                  onBlur={() => handleSave({ filterWarnMessage: config.filterWarnMessage })}
                />
              </div>
              <div>
                <label className="label">Kick Message</label>
                <p className="text-xs text-gray-500 mb-1">Sent in channel when a user is kicked for violations</p>
                <textarea
                  className="input min-h-[60px] resize-y font-mono text-sm"
                  value={config.filterKickMessage ?? ''}
                  placeholder="⛔ {user} was **kicked** for repeated word filter violations (violation #{count})."
                  onChange={(e) => setConfig((c) => ({ ...c, filterKickMessage: e.target.value }))}
                  onBlur={() => handleSave({ filterKickMessage: config.filterKickMessage })}
                />
              </div>
              <div>
                <label className="label">Kick DM Message</label>
                <p className="text-xs text-gray-500 mb-1">Sent via DM to the kicked user (<code className="text-gray-400">{'{user}'}</code> not available here)</p>
                <textarea
                  className="input min-h-[60px] resize-y font-mono text-sm"
                  value={config.filterKickDMMessage ?? ''}
                  placeholder="You were kicked from **{server}** for repeated word filter violations (violation #{count})."
                  onChange={(e) => setConfig((c) => ({ ...c, filterKickDMMessage: e.target.value }))}
                  onBlur={() => handleSave({ filterKickDMMessage: config.filterKickDMMessage })}
                />
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Anti-Mention Spam" description="Prevent mass pinging.">
        <Toggle
          label="Enable Anti-Mention"
          enabled={config.antiMentionEnabled ?? false}
          onChange={(v) => handleToggle('antiMentionEnabled', v)}
        />
        {config.antiMentionEnabled && (
          <div className="pt-2">
            <label className="label">Max Mentions per Message</label>
            <input
              type="number"
              className="input w-full sm:w-32"
              value={config.mentionThreshold ?? 5}
              min={2}
              max={20}
              onChange={(e) => setConfig((c) => ({ ...c, mentionThreshold: parseInt(e.target.value) }))}
              onBlur={() => handleSave({ mentionThreshold: config.mentionThreshold })}
            />
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Anti-Raid" description="Protect against coordinated join raids.">
        <Toggle
          label="Enable Anti-Raid"
          enabled={config.antiRaidEnabled ?? false}
          onChange={(v) => handleToggle('antiRaidEnabled', v)}
        />
        {config.antiRaidEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">Join Threshold</label>
              <input
                type="number"
                className="input"
                value={config.raidThreshold ?? 10}
                min={5}
                max={50}
                onChange={(e) => setConfig((c) => ({ ...c, raidThreshold: parseInt(e.target.value) }))}
                onBlur={() => handleSave({ raidThreshold: config.raidThreshold })}
              />
            </div>
            <div>
              <label className="label">Interval (ms)</label>
              <input
                type="number"
                className="input"
                value={config.raidInterval ?? 10000}
                min={5000}
                max={60000}
                step={1000}
                onChange={(e) => setConfig((c) => ({ ...c, raidInterval: parseInt(e.target.value) }))}
                onBlur={() => handleSave({ raidInterval: config.raidInterval })}
              />
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Anti-Phishing"
        description="Detect and remove known phishing and scam links. Domain blocklist is refreshed hourly from a public feed."
      >
        <Toggle
          label="Enable Anti-Phishing"
          description="Automatically delete messages containing known phishing links"
          enabled={config.antiPhishingEnabled ?? false}
          onChange={(v) => handleToggle('antiPhishingEnabled', v)}
        />
        {config.antiPhishingEnabled && (
          <div className="mt-3">
            <label className="label">Action</label>
            <select
              className="input w-auto"
              value={config.antiPhishingAction ?? 'delete_mute'}
              onChange={(e) => {
                setConfig((c) => ({ ...c, antiPhishingAction: e.target.value }));
                handleSave({ antiPhishingAction: e.target.value });
              }}
            >
              <option value="delete">Delete message only</option>
              <option value="delete_mute">Delete message + timeout user (10 min)</option>
            </select>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Exempt Roles"
        description="Members with any of these roles are never moderated by Auto-Mod. Administrators are always exempt."
      >
        <div className="space-y-3">
          <select
            className="input"
            value=""
            onChange={(e) => { if (e.target.value) toggleExemptRole(e.target.value); }}
          >
            <option value="">Add an exempt role…</option>
            {allRoles
              .filter((r) => !(config.exemptRoles ?? []).includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {(config.exemptRoles ?? []).length === 0 && (
              <p className="text-gray-500 text-xs">No exempt roles</p>
            )}
            {(config.exemptRoles ?? []).map((roleId) => {
              const role = allRoles.find((r) => r.id === roleId);
              return (
                <span
                  key={roleId}
                  className="inline-flex items-center gap-1 bg-discord-blurple/20 text-discord-blurple border border-discord-blurple/40 rounded px-2 py-0.5 text-xs"
                >
                  @{role?.name ?? roleId}
                  <button onClick={() => toggleExemptRole(roleId)} className="hover:text-white ml-1"><X className="w-3 h-3" /></button>
                </span>
              );
            })}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Exempt Channels"
        description="Auto-Mod is disabled in these channels. Useful for bot or staff channels."
      >
        <div className="space-y-3">
          <select
            className="input"
            value=""
            onChange={(e) => { if (e.target.value) toggleExemptChannel(e.target.value); }}
          >
            <option value="">Add an exempt channel…</option>
            {textChannels
              .filter((c) => !(config.exemptChannels ?? []).includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {(config.exemptChannels ?? []).length === 0 && (
              <p className="text-gray-500 text-xs">No exempt channels</p>
            )}
            {(config.exemptChannels ?? []).map((channelId) => {
              const channel = textChannels.find((c) => c.id === channelId);
              return (
                <span
                  key={channelId}
                  className="inline-flex items-center gap-1 bg-green-900/30 text-green-400 border border-green-700/50 rounded px-2 py-0.5 text-xs"
                >
                  #{channel?.name ?? channelId}
                  <button onClick={() => toggleExemptChannel(channelId)} className="hover:text-white ml-1"><X className="w-3 h-3" /></button>
                </span>
              );
            })}
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
