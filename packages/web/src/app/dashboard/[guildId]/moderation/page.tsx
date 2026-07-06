'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { moderationApi, settingsApi, warningEscalationApi } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Shield, Search, AlertTriangle, Trash2, Plus } from 'lucide-react';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import type { GuildSettings } from '@arkenbot/shared';

type Tab = 'cases' | 'warnings' | 'escalation';
type EscalationRule = { count: number; action: string; duration?: number };

export default function ModerationPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('cases');
  const [modSettings, setModSettings] = useState<Partial<GuildSettings>>({});

  const { data: settingsRes } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
  });

  useEffect(() => {
    if (settingsRes?.data?.data) setModSettings(settingsRes.data.data);
  }, [settingsRes]);

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<GuildSettings>) => settingsApi.update(guildId, data),
    onSuccess: () => {
      toast.success('Saved!');
      queryClient.invalidateQueries({ queryKey: ['settings', guildId] });
    },
    onError: () => toast.error('Failed to save.'),
  });

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  const { data: casesRes, isLoading: casesLoading } = useQuery({
    queryKey: ['cases', guildId, page, typeFilter],
    queryFn: () => moderationApi.getCases(guildId, { page, type: typeFilter || undefined }),
    refetchInterval: 15000,
    enabled: tab === 'cases',
  });

  const cases = casesRes?.data?.data?.items ?? [];
  const total = casesRes?.data?.data?.total ?? 0;
  const hasMore = casesRes?.data?.data?.hasMore ?? false;

  const [warningUserId, setWarningUserId] = useState('');
  const [warningSearch, setWarningSearch] = useState('');

  // Warning escalation state
  const [escalations, setEscalations] = useState<EscalationRule[]>([]);
  const [newEscCount, setNewEscCount] = useState('3');
  const [newEscAction, setNewEscAction] = useState('mute');
  const [newEscDuration, setNewEscDuration] = useState('3600');

  const { data: escalationRes } = useQuery({
    queryKey: ['warn-escalation', guildId],
    queryFn: () => warningEscalationApi.get(guildId),
    enabled: tab === 'escalation',
  });

  useEffect(() => {
    if (escalationRes?.data?.data) setEscalations(escalationRes.data.data as EscalationRule[]);
  }, [escalationRes]);

  const saveEscalationMutation = useMutation({
    mutationFn: (rules: EscalationRule[]) => warningEscalationApi.update(guildId, rules),
    onSuccess: () => {
      toast.success('Escalation rules saved!');
      queryClient.invalidateQueries({ queryKey: ['warn-escalation', guildId] });
    },
    onError: () => toast.error('Failed to save escalation rules'),
  });

  const { data: warningsRes, isLoading: warningsLoading } = useQuery({
    queryKey: ['warnings', guildId, warningSearch],
    queryFn: () => moderationApi.getWarnings(guildId, { userId: warningSearch || undefined, active: 'true' }),
    enabled: tab === 'warnings',
  });

  const warnings: {
    id: string;
    userId: string;
    userTag: string;
    moderatorId: string;
    moderatorTag: string;
    reason: string;
    active: boolean;
    createdAt: string;
  }[] = warningsRes?.data?.data ?? [];

  const clearOneMutation = useMutation({
    mutationFn: (id: string) => moderationApi.clearWarning(guildId, id),
    onSuccess: () => {
      toast.success('Warning cleared');
      queryClient.invalidateQueries({ queryKey: ['warnings', guildId] });
    },
    onError: () => toast.error('Failed to clear warning'),
  });

  const clearAllMutation = useMutation({
    mutationFn: (userId: string) => moderationApi.clearAllWarnings(guildId, userId),
    onSuccess: (res) => {
      const count = (res as { data?: { data?: { cleared?: number } } }).data?.data?.cleared ?? 0;
      toast.success(`Cleared ${count} warning(s)`);
      queryClient.invalidateQueries({ queryKey: ['warnings', guildId] });
    },
    onError: () => toast.error('Failed to clear warnings'),
  });

  // Group warnings by userId for "Clear all" per user
  const warningsByUser = warnings.reduce<Record<string, typeof warnings>>((acc, w) => {
    if (!acc[w.userId]) acc[w.userId] = [];
    acc[w.userId].push(w);
    return acc;
  }, {});

  const typeColors: Record<string, string> = {
    ban: 'badge-danger',
    tempban: 'badge-danger',
    kick: 'badge-warning',
    mute: 'badge-warning',
    unmute: 'badge-success',
    unban: 'badge-success',
    warn: 'badge-info',
    clearwarn: 'badge-success',
  };

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><Shield className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Moderation</h1>
          <div className="page-head-desc">View and manage moderation cases and warnings.</div>
        </div>
      </div>

      <SettingsSection title="Moderation Commands" description="Enable or disable all moderation commands (ban, kick, mute, warn, etc.).">
        <Toggle
          label="Enable Moderation"
          enabled={modSettings.moderationEnabled ?? true}
          onChange={(v) => {
            setModSettings((s) => ({ ...s, moderationEnabled: v }));
            settingsMutation.mutate({ moderationEnabled: v });
          }}
        />
      </SettingsSection>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        <button
          onClick={() => setTab('cases')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'cases'
              ? 'border-discord-blurple text-discord-blurple'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Cases
          {total > 0 && <span className="ml-2 text-xs text-gray-500">({total})</span>}
        </button>
        <button
          onClick={() => setTab('warnings')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'warnings'
              ? 'border-discord-blurple text-discord-blurple'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Active Warnings
          {warnings.length > 0 && <span className="ml-2 text-xs text-red-400">({warnings.length})</span>}
        </button>
        <button
          onClick={() => setTab('escalation')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'escalation'
              ? 'border-discord-blurple text-discord-blurple'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Auto-Actions
        </button>
      </div>

      {/* ── Cases Tab ── */}
      {tab === 'cases' && (
        <>
          <div className="card mb-6 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by user ID..."
                className="input pl-9"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="input sm:w-48"
            >
              <option value="">All Types</option>
              <option value="ban">Ban</option>
              <option value="kick">Kick</option>
              <option value="mute">Mute</option>
              <option value="warn">Warn</option>
              <option value="clearwarn">Clear Warn</option>
              <option value="unban">Unban</option>
            </select>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Moderator</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {casesLoading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-4 bg-gray-700 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : cases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No cases found
                    </td>
                  </tr>
                ) : (
                  cases.map((c: {
                    id: string;
                    caseNumber: number;
                    type: string;
                    userTag: string;
                    userId: string;
                    moderatorTag: string;
                    reason: string;
                    createdAt: string;
                  }) => (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-400">#{c.caseNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${typeColors[c.type] ?? 'badge-info'}`}>
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-200">{c.userTag}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{c.moderatorTag}</td>
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{c.reason}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>

            {total > 20 && (
              <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Showing {Math.min((page - 1) * 20 + 1, total)}–{Math.min(page * 20, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Warnings Tab ── */}
      {tab === 'warnings' && (
        <>
          <div className="card mb-6 flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter by user ID (leave blank for all)..."
                value={warningUserId}
                onChange={(e) => setWarningUserId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setWarningSearch(warningUserId)}
                className="input pl-9"
              />
            </div>
            <button onClick={() => setWarningSearch(warningUserId)} className="btn-secondary">
              Search
            </button>
          </div>

          {warningsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card animate-pulse h-20" />
              ))}
            </div>
          ) : warnings.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No active warnings found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(warningsByUser).map(([userId, userWarnings]) => (
                <div key={userId} className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-[var(--bg-base)] flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {userWarnings[0].userTag || userId}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">{userId}</p>
                      <p className="text-xs text-gray-400">{userWarnings.length} active warning(s)</p>
                    </div>
                    <button
                      onClick={() => clearAllMutation.mutate(userId)}
                      disabled={clearAllMutation.isPending}
                      className="btn-secondary text-xs py-1 px-3 text-red-400 hover:text-red-300 border-red-700/50"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {userWarnings.map((w) => (
                      <div key={w.id} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 truncate">{w.reason}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            By <span className="text-gray-400">{w.moderatorTag || w.moderatorId}</span> ·{' '}
                            {new Date(w.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => clearOneMutation.mutate(w.id)}
                          disabled={clearOneMutation.isPending}
                          className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                          title="Clear this warning"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Escalation Tab ── */}
      {tab === 'escalation' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-base font-semibold text-white mb-1">Warning Auto-Actions</h3>
            <p className="text-sm text-gray-400 mb-4">
              Automatically mute, timeout, kick, or ban members when they reach a warning threshold.
              Rules are checked each time a warning is issued.
            </p>

            {escalations.length > 0 ? (
              <div className="space-y-2 mb-4">
                {[...escalations].sort((a, b) => a.count - b.count).map((rule, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-200">
                      At <strong className="text-white">{rule.count}</strong> warnings → <strong className="text-discord-blurple capitalize">{rule.action}</strong>
                      {rule.duration ? <span className="text-gray-400"> ({rule.duration}s)</span> : null}
                    </span>
                    <button
                      onClick={() => {
                        const updated = escalations.filter((_, j) => j !== i);
                        setEscalations(updated);
                        saveEscalationMutation.mutate(updated);
                      }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No auto-action rules configured.</p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const count = parseInt(newEscCount);
                if (!count || count < 1) return toast.error('Enter a valid warning count');
                const rule: EscalationRule = {
                  count,
                  action: newEscAction,
                  ...((['mute', 'timeout'].includes(newEscAction) && newEscDuration) ? { duration: parseInt(newEscDuration) } : {}),
                };
                const updated = [...escalations.filter((r) => r.count !== count), rule].sort((a, b) => a.count - b.count);
                setEscalations(updated);
                saveEscalationMutation.mutate(updated);
              }}
              className="flex flex-wrap items-end gap-3 border-t border-[var(--border-subtle)] pt-4"
            >
              <div className="w-24">
                <label className="label">At # warnings</label>
                <input type="number" min="1" className="input" value={newEscCount} onChange={(e) => setNewEscCount(e.target.value)} required />
              </div>
              <div>
                <label className="label">Action</label>
                <select className="input" value={newEscAction} onChange={(e) => setNewEscAction(e.target.value)}>
                  <option value="mute">Mute (via mute role)</option>
                  <option value="timeout">Timeout</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                </select>
              </div>
              {['mute', 'timeout'].includes(newEscAction) && (
                <div className="w-36">
                  <label className="label">Duration (seconds)</label>
                  <input type="number" min="60" className="input" value={newEscDuration} onChange={(e) => setNewEscDuration(e.target.value)} />
                </div>
              )}
              <button type="submit" disabled={saveEscalationMutation.isPending} className="btn-primary flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
