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
import { useTranslations } from 'next-intl';

// ─── Filter-type label map (backend reason → i18n key) ────────────────────────
const FILTER_LABELS: Record<string, string> = {
  'Word filter violation': 'labelWordFilter',
  'Spam detected':         'labelAntiSpam',
  'Link detected':         'labelAntiLink',
  'Mention spam':          'labelAntiMention',
  'Caps spam':             'labelAntiCaps',
  'Raid detected':         'labelAntiRaid',
};

// ─── Automod analytics panel ──────────────────────────────────────────────────
function AutoModStats({ guildId }: { guildId: string }) {
  const t = useTranslations('automodPage');
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
          <h2 className="text-sm font-semibold text-white">{t('statsTitle')}</h2>
          <span className="text-xs text-gray-500 font-normal">· {t('actionsTotal', { total: analytics.total })}</span>
        </div>
        <select
          className="input text-xs py-1 w-28"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>{t('last7')}</option>
          <option value={14}>{t('last14')}</option>
          <option value={30}>{t('last30')}</option>
        </select>
      </div>

      {analytics.total === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">{t('noActions')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Time-series chart */}
          <div>
            <p className="text-xs text-gray-500 mb-2">{t('actionsPerDay')}</p>
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
            <p className="text-xs text-gray-500 mb-2">{t('byFilterType')}</p>
            <div className="space-y-1.5">
              {filterRows.map(([reason, count]) => {
                const label = FILTER_LABELS[reason] ? t(FILTER_LABELS[reason]) : reason;
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
  const t = useTranslations('automodPage');
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
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['automod', guildId] });
    },
    onError: () => toast.error(t('saveError')),
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
      toast.error(t('wordExists', { word: trimmed }));
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
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <AutoModStats guildId={guildId} />

      <SettingsSection title={t('spamTitle')} description={t('spamDesc')}>
        <Toggle
          label={t('enableSpam')}
          enabled={config.antiSpamEnabled ?? false}
          onChange={(v) => handleToggle('antiSpamEnabled', v)}
        />
        {config.antiSpamEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">{t('msgThreshold')}</label>
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
              <label className="label">{t('intervalMs')}</label>
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
        title={t('wordTitle')}
        description={t('wordDesc')}
      >
        <Toggle
          label={t('enableWord')}
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
                  placeholder={t('addWord')}
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addWord()}
                />
                <button onClick={addWord} className="btn-primary">{t('add')}</button>
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
                  <p className="text-gray-500 text-xs">{t('noWords')}</p>
                )}
              </div>
            </div>

            {/* Escalation thresholds */}
            <div className="border-t border-[var(--border-subtle)] pt-4">
              <p className="text-sm font-medium text-white mb-3">{t('escalation')}</p>
              <p className="text-xs text-gray-500 mb-3">
                {t('escalationDesc')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">{t('beforeTimeout')}</label>
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
                  <label className="label">{t('timeoutDuration')}</label>
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
                    {t('minSuffix', { min: Math.ceil((config.filterTimeoutDuration ?? 300) / 60) })}
                  </p>
                </div>
                <div>
                  <label className="label">{t('beforeKick')}</label>
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
                <p>{t('sum1Prefix', { max: (config.filterWarnBeforeTimeout ?? 3) - 1 })} <span className="text-yellow-400">{t('deleteWarn')}</span></p>
                <p>{t('sum2Prefix', { from: config.filterWarnBeforeTimeout ?? 3, to: (config.filterWarnBeforeKick ?? 5) - 1 })} <span className="text-orange-400">{t('timeoutLabel', { min: Math.ceil((config.filterTimeoutDuration ?? 300) / 60) })}</span></p>
                <p>{t('sum3Prefix', { n: config.filterWarnBeforeKick ?? 5 })} <span className="text-red-400">{t('kickLabel')}</span></p>
              </div>
            </div>

            {/* Custom messages */}
            <div className="border-t border-[var(--border-subtle)] pt-4 space-y-4">
              <p className="text-sm font-medium text-white">{t('messages')}</p>
              <p className="text-xs text-gray-500 -mt-2">
                {t('variablesLabel')} <code className="text-gray-400">{'{user}'}</code> <code className="text-gray-400">{'{count}'}</code> <code className="text-gray-400">{'{server}'}</code>
              </p>
              <div>
                <label className="label">{t('warnMsgLabel')}</label>
                <p className="text-xs text-gray-500 mb-1">{t('warnMsgDesc')}</p>
                <textarea
                  className="input min-h-[60px] resize-y font-mono text-sm"
                  value={config.filterWarnMessage ?? ''}
                  placeholder={t('warnMsgPlaceholder')}
                  onChange={(e) => setConfig((c) => ({ ...c, filterWarnMessage: e.target.value }))}
                  onBlur={() => handleSave({ filterWarnMessage: config.filterWarnMessage })}
                />
              </div>
              <div>
                <label className="label">{t('kickMsgLabel')}</label>
                <p className="text-xs text-gray-500 mb-1">{t('kickMsgDesc')}</p>
                <textarea
                  className="input min-h-[60px] resize-y font-mono text-sm"
                  value={config.filterKickMessage ?? ''}
                  placeholder={t('kickMsgPlaceholder')}
                  onChange={(e) => setConfig((c) => ({ ...c, filterKickMessage: e.target.value }))}
                  onBlur={() => handleSave({ filterKickMessage: config.filterKickMessage })}
                />
              </div>
              <div>
                <label className="label">{t('kickDMLabel')}</label>
                <p className="text-xs text-gray-500 mb-1">{t('kickDMDescPre')}<code className="text-gray-400">{'{user}'}</code>{t('kickDMDescPost')}</p>
                <textarea
                  className="input min-h-[60px] resize-y font-mono text-sm"
                  value={config.filterKickDMMessage ?? ''}
                  placeholder={t('kickDMPlaceholder')}
                  onChange={(e) => setConfig((c) => ({ ...c, filterKickDMMessage: e.target.value }))}
                  onBlur={() => handleSave({ filterKickDMMessage: config.filterKickDMMessage })}
                />
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('mentionTitle')} description={t('mentionDesc')}>
        <Toggle
          label={t('enableMention')}
          enabled={config.antiMentionEnabled ?? false}
          onChange={(v) => handleToggle('antiMentionEnabled', v)}
        />
        {config.antiMentionEnabled && (
          <div className="pt-2">
            <label className="label">{t('maxMentions')}</label>
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

      <SettingsSection title={t('raidTitle')} description={t('raidDesc')}>
        <Toggle
          label={t('enableRaid')}
          enabled={config.antiRaidEnabled ?? false}
          onChange={(v) => handleToggle('antiRaidEnabled', v)}
        />
        {config.antiRaidEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">{t('joinThreshold')}</label>
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
              <label className="label">{t('intervalMs')}</label>
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

      <SettingsSection title={t('accountAgeTitle')} description={t('accountAgeDesc')}>
        <Toggle
          label={t('accountAgeEnable')}
          description={t('accountAgeEnableDesc')}
          enabled={config.minAccountAgeEnabled ?? false}
          onChange={(v) => handleToggle('minAccountAgeEnabled', v)}
        />
        {config.minAccountAgeEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">{t('accountAgeMinHours')}</label>
              <input
                type="number"
                className="input"
                value={config.minAccountAgeHours ?? 72}
                min={1}
                max={8760}
                onChange={(e) => setConfig((c) => ({ ...c, minAccountAgeHours: parseInt(e.target.value) }))}
                onBlur={() => handleSave({ minAccountAgeHours: config.minAccountAgeHours })}
              />
            </div>
            <div>
              <label className="label">{t('accountAgeAction')}</label>
              <select
                className="input"
                value={config.minAccountAgeAction ?? 'kick'}
                onChange={(e) => { const v = e.target.value; setConfig((c) => ({ ...c, minAccountAgeAction: v })); handleSave({ minAccountAgeAction: v }); }}
              >
                <option value="kick">{t('accountAgeActionKick')}</option>
                <option value="ban">{t('accountAgeActionBan')}</option>
                <option value="alert">{t('accountAgeActionAlert')}</option>
                <option value="quarantine">{t('accountAgeActionQuarantine')}</option>
              </select>
            </div>
            {config.minAccountAgeAction === 'quarantine' && (
              <div>
                <label className="label">{t('quarantineRole')}</label>
                <select
                  className="input"
                  value={config.quarantineRoleId ?? ''}
                  onChange={(e) => { const v = e.target.value || null; setConfig((c) => ({ ...c, quarantineRoleId: v })); handleSave({ quarantineRoleId: v }); }}
                >
                  <option value="">{t('quarantineRoleNone')}</option>
                  {allRoles.filter((r) => r.name !== '@everyone').map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{t('quarantineRoleHelp')}</p>
              </div>
            )}
          </div>
        )}
        <div className="pt-3">
          <Toggle
            label={t('accountAgeFlagEnable')}
            description={t('accountAgeFlagEnableDesc')}
            enabled={config.newAccountFlagEnabled ?? false}
            onChange={(v) => handleToggle('newAccountFlagEnabled', v)}
          />
          {config.newAccountFlagEnabled && (
            <div className="pt-2 max-w-xs">
              <label className="label">{t('accountAgeFlagHours')}</label>
              <input
                type="number"
                className="input"
                value={config.newAccountFlagHours ?? 168}
                min={1}
                max={8760}
                onChange={(e) => setConfig((c) => ({ ...c, newAccountFlagHours: parseInt(e.target.value) }))}
                onBlur={() => handleSave({ newAccountFlagHours: config.newAccountFlagHours })}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('phishTitle')}
        description={t('phishDesc')}
      >
        <Toggle
          label={t('enablePhish')}
          description={t('enablePhishDesc')}
          enabled={config.antiPhishingEnabled ?? false}
          onChange={(v) => handleToggle('antiPhishingEnabled', v)}
        />
        {config.antiPhishingEnabled && (
          <div className="mt-3">
            <label className="label">{t('actionLabel')}</label>
            <select
              className="input w-auto"
              value={config.antiPhishingAction ?? 'delete_mute'}
              onChange={(e) => {
                setConfig((c) => ({ ...c, antiPhishingAction: e.target.value }));
                handleSave({ antiPhishingAction: e.target.value });
              }}
            >
              <option value="delete">{t('phishDelete')}</option>
              <option value="delete_mute">{t('phishDeleteMute')}</option>
            </select>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('aiTitle')}
        description={t('aiDesc')}
      >
        <Toggle
          label={t('enableAi')}
          description={t('enableAiDesc')}
          enabled={config.aiModEnabled ?? false}
          onChange={(v) => handleToggle('aiModEnabled', v)}
        />
        {config.aiModEnabled && (
          <div className="mt-3">
            <label className="label">{t('aiActionLabel')}</label>
            <select
              className="input w-auto"
              value={config.aiModAction ?? 'flag'}
              onChange={(e) => {
                setConfig((c) => ({ ...c, aiModAction: e.target.value }));
                handleSave({ aiModAction: e.target.value });
              }}
            >
              <option value="flag">{t('aiFlag')}</option>
              <option value="delete">{t('aiDelete')}</option>
            </select>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('exemptRolesTitle')}
        description={t('exemptRolesDesc')}
      >
        <div className="space-y-3">
          <select
            className="input"
            value=""
            onChange={(e) => { if (e.target.value) toggleExemptRole(e.target.value); }}
          >
            <option value="">{t('addExemptRole')}</option>
            {allRoles
              .filter((r) => !(config.exemptRoles ?? []).includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {(config.exemptRoles ?? []).length === 0 && (
              <p className="text-gray-500 text-xs">{t('noExemptRoles')}</p>
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
        title={t('exemptChannelsTitle')}
        description={t('exemptChannelsDesc')}
      >
        <div className="space-y-3">
          <select
            className="input"
            value=""
            onChange={(e) => { if (e.target.value) toggleExemptChannel(e.target.value); }}
          >
            <option value="">{t('addExemptChannel')}</option>
            {textChannels
              .filter((c) => !(config.exemptChannels ?? []).includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {(config.exemptChannels ?? []).length === 0 && (
              <p className="text-gray-500 text-xs">{t('noExemptChannels')}</p>
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
