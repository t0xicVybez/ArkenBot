'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import type { GuildSettings } from '@arkenbot/shared';
import { TrendingUp, Plus, Trash2, AlertTriangle, Info } from 'lucide-react';
import api from '@/lib/api';

type LevelRole = {
  id: string;
  level: number;
  roleId: string;
};

type XpMultiplier = {
  id: string;
  roleId: string;
  multiplier: number;
};

type XpChannelMultiplier = {
  id: string;
  channelId: string;
  multiplier: number;
};

const levelRolesApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/level-roles`),
  create: (guildId: string, data: { level: number; roleId: string }) =>
    api.post(`/guilds/${guildId}/level-roles`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/level-roles/${id}`),
};

const xpMultipliersApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/xp-multipliers`),
  create: (guildId: string, data: { roleId: string; multiplier: number }) =>
    api.post(`/guilds/${guildId}/xp-multipliers`, data),
  delete: (guildId: string, roleId: string) => api.delete(`/guilds/${guildId}/xp-multipliers/${roleId}`),
};

const leaderboardApi = {
  reset: (guildId: string) => api.delete(`/guilds/${guildId}/leaderboard`),
};

const xpChannelMultipliersApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/xp-channel-multipliers`),
  create: (guildId: string, data: { channelId: string; multiplier: number }) =>
    api.post(`/guilds/${guildId}/xp-channel-multipliers`, data),
  delete: (guildId: string, channelId: string) =>
    api.delete(`/guilds/${guildId}/xp-channel-multipliers/${channelId}`),
};


export default function LevelingPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<GuildSettings>>({});
  const [newLevel, setNewLevel] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newMultiplierRoleId, setNewMultiplierRoleId] = useState('');
  const [newMultiplierValue, setNewMultiplierValue] = useState('1.5');
  const [newChannelMultiplierChannelId, setNewChannelMultiplierChannelId] = useState('');
  const [newChannelMultiplierValue, setNewChannelMultiplierValue] = useState('1.5');

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const { data: levelRolesRes, isLoading: levelRolesLoading } = useQuery({
    queryKey: ['level-roles', guildId],
    queryFn: () => levelRolesApi.list(guildId),
  });

  const { data: xpMultipliersRes } = useQuery({
    queryKey: ['xp-multipliers', guildId],
    queryFn: () => xpMultipliersApi.list(guildId),
  });

  const { data: xpChannelMultipliersRes } = useQuery({
    queryKey: ['xp-channel-multipliers', guildId],
    queryFn: () => xpChannelMultipliersApi.list(guildId),
  });

  useEffect(() => {
    if (settingsRes?.data?.data) setSettings(settingsRes.data.data);
  }, [settingsRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<GuildSettings>) => settingsApi.update(guildId, data),
    onSuccess: () => {
      toast.success('Leveling settings saved!');
      queryClient.invalidateQueries({ queryKey: ['settings', guildId] });
    },
    onError: () => toast.error('Failed to save leveling settings.'),
  });

  const createLevelRoleMutation = useMutation({
    mutationFn: (data: { level: number; roleId: string }) => levelRolesApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Level role added!');
      queryClient.invalidateQueries({ queryKey: ['level-roles', guildId] });
      setNewLevel('');
      setNewRoleId('');
    },
    onError: () => toast.error('Failed to add level role'),
  });

  const deleteLevelRoleMutation = useMutation({
    mutationFn: (id: string) => levelRolesApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Level role removed');
      queryClient.invalidateQueries({ queryKey: ['level-roles', guildId] });
    },
    onError: () => toast.error('Failed to remove level role'),
  });

  const createMultiplierMutation = useMutation({
    mutationFn: (data: { roleId: string; multiplier: number }) => xpMultipliersApi.create(guildId, data),
    onSuccess: () => {
      toast.success('XP multiplier added!');
      queryClient.invalidateQueries({ queryKey: ['xp-multipliers', guildId] });
      setNewMultiplierRoleId('');
      setNewMultiplierValue('1.5');
    },
    onError: () => toast.error('Failed to add XP multiplier'),
  });

  const deleteMultiplierMutation = useMutation({
    mutationFn: (roleId: string) => xpMultipliersApi.delete(guildId, roleId),
    onSuccess: () => {
      toast.success('Multiplier removed');
      queryClient.invalidateQueries({ queryKey: ['xp-multipliers', guildId] });
    },
    onError: () => toast.error('Failed to remove multiplier'),
  });

  const createChannelMultiplierMutation = useMutation({
    mutationFn: (data: { channelId: string; multiplier: number }) =>
      xpChannelMultipliersApi.create(guildId, data),
    onSuccess: () => {
      toast.success('Channel XP multiplier added!');
      queryClient.invalidateQueries({ queryKey: ['xp-channel-multipliers', guildId] });
      setNewChannelMultiplierChannelId('');
      setNewChannelMultiplierValue('1.5');
    },
    onError: () => toast.error('Failed to add channel XP multiplier'),
  });

  const deleteChannelMultiplierMutation = useMutation({
    mutationFn: (channelId: string) => xpChannelMultipliersApi.delete(guildId, channelId),
    onSuccess: () => {
      toast.success('Channel multiplier removed');
      queryClient.invalidateQueries({ queryKey: ['xp-channel-multipliers', guildId] });
    },
    onError: () => toast.error('Failed to remove channel multiplier'),
  });

  const resetXpMutation = useMutation({
    mutationFn: () => leaderboardApi.reset(guildId),
    onSuccess: () => {
      toast.success('All XP has been reset!');
      setShowResetConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['leaderboard', guildId] });
    },
    onError: () => toast.error('Failed to reset XP'),
  });

  const handleSave = (partial: Partial<GuildSettings>) => mutation.mutate(partial);

  const channels = (channelsRes?.data?.data ?? []) as Array<{ id: string; name: string; type: number }>;
  const textChannels = channels.filter((c) => c.type === 0);
  const roles = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
  const levelRoles: LevelRole[] = (levelRolesRes?.data as { data?: LevelRole[] })?.data ?? [];
  const sortedLevelRoles = [...levelRoles].sort((a, b) => a.level - b.level);
  const xpMultipliers: XpMultiplier[] = (xpMultipliersRes?.data as { data?: XpMultiplier[] })?.data ?? [];
  const xpChannelMultipliers: XpChannelMultiplier[] =
    (xpChannelMultipliersRes?.data as { data?: XpChannelMultiplier[] })?.data ?? [];

  const handleAddLevelRole = (e: React.FormEvent) => {
    e.preventDefault();
    const level = parseInt(newLevel);
    if (!level || level < 1 || !newRoleId) {
      toast.error('Please enter a valid level and select a role');
      return;
    }
    createLevelRoleMutation.mutate({ level, roleId: newRoleId });
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><TrendingUp className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Leveling</h1>
          <div className="page-head-desc">XP, level-ups, and role rewards.</div>
        </div>
      </div>

      <SettingsSection title="XP System" description="Configure how users earn XP by chatting.">
        <Toggle
          label="Enable Leveling"
          description="Users earn XP for sending messages and level up over time"
          enabled={settings.levelingEnabled ?? true}
          onChange={(v) => { setSettings((s) => ({ ...s, levelingEnabled: v })); handleSave({ levelingEnabled: v }); }}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">XP Per Message</label>
            <input
              type="number"
              className="input"
              value={settings.xpPerMessage ?? 15}
              min={1}
              max={100}
              onChange={(e) => setSettings((s) => ({ ...s, xpPerMessage: parseInt(e.target.value) }))}
              onBlur={() => handleSave({ xpPerMessage: settings.xpPerMessage })}
            />
            <p className="text-xs text-gray-500 mt-1">XP awarded per eligible message (1–100)</p>
          </div>
          <div>
            <label className="label">XP Cooldown (seconds)</label>
            <input
              type="number"
              className="input"
              value={settings.xpCooldown ?? 60}
              min={5}
              max={600}
              onChange={(e) => setSettings((s) => ({ ...s, xpCooldown: parseInt(e.target.value) }))}
              onBlur={() => handleSave({ xpCooldown: settings.xpCooldown })}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum seconds between XP awards per user</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Level-Up Notifications" description="Announce when a user levels up.">
        <Toggle
          label="Rich Embed Notifications"
          description="Send level-up announcements as styled embeds with milestone badges (Gold for milestone levels, Blue/Purple for higher levels)"
          enabled={settings.levelUpEmbed ?? true}
          onChange={(v) => { setSettings((s) => ({ ...s, levelUpEmbed: v })); handleSave({ levelUpEmbed: v }); }}
        />
        <div>
          <label className="label">Level-Up Message</label>
          <input
            type="text"
            className="input"
            value={settings.levelUpMessage ?? ''}
            placeholder="Congratulations {user}, you reached level {level}!"
            onChange={(e) => setSettings((s) => ({ ...s, levelUpMessage: e.target.value }))}
            onBlur={() => handleSave({ levelUpMessage: settings.levelUpMessage })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Variables: {'{user}'}, {'{username}'}, {'{level}'}, {'{server}'}
          </p>
        </div>
        <div>
          <label className="label">Level-Up Channel</label>
          <select
            className="input"
            value={settings.levelUpChannelId ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, levelUpChannelId: e.target.value || undefined }))}
            onBlur={() => handleSave({ levelUpChannelId: settings.levelUpChannelId })}
          >
            <option value="">Same channel as message</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </div>
      </SettingsSection>

      {/* Level Roles */}
      <div className="card mb-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Level Roles</h3>
          <p className="text-sm text-gray-400 mt-1">Automatically assign roles when members reach a certain level.</p>
        </div>

        <div className="mb-4">
          <Toggle
            label="Keep Previous Roles"
            description="When disabled, members lose lower-level roles when they earn a higher one"
            enabled={settings.keepPreviousRoles ?? false}
            onChange={(v) => { setSettings((s) => ({ ...s, keepPreviousRoles: v })); handleSave({ keepPreviousRoles: v }); }}
          />
        </div>

        {/* Add level role form */}
        <form onSubmit={handleAddLevelRole} className="flex gap-3 mb-5 items-end">
          <div className="w-28">
            <label className="label">Level</label>
            <input
              type="number"
              className="input"
              placeholder="e.g. 10"
              min={1}
              max={1000}
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="label">Role</label>
            <select
              className="input"
              value={newRoleId}
              onChange={(e) => setNewRoleId(e.target.value)}
            >
              <option value="">Select a role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={createLevelRoleMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>

        {levelRolesLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : sortedLevelRoles.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">
            No level roles configured. Add one above to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Level</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Role</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sortedLevelRoles.map((lr) => {
                  const role = roles.find((r) => r.id === lr.roleId);
                  return (
                    <tr key={lr.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-200">Level {lr.level}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {role ? `@${role.name}` : <span className="font-mono text-gray-600 text-xs">{lr.roleId}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteLevelRoleMutation.mutate(lr.id)}
                          disabled={deleteLevelRoleMutation.isPending}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                          title="Remove level role"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* XP Role Multipliers */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-1">XP Role Multipliers</h3>
        <p className="text-sm text-gray-400 mb-4">Give members with specific roles a bonus XP multiplier. The highest matching multiplier applies.</p>
        {xpMultipliers.length > 0 ? (
          <div className="space-y-2 mb-4">
            {xpMultipliers.map((m) => {
              const role = roles.find((r) => r.id === m.roleId);
              return (
                <div key={m.id} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-200">@{role?.name ?? m.roleId}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-discord-blurple">{m.multiplier}×</span>
                    <button
                      onClick={() => deleteMultiplierMutation.mutate(m.roleId)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-4">No XP multipliers configured.</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newMultiplierRoleId) return toast.error('Select a role');
            const val = parseFloat(newMultiplierValue);
            if (isNaN(val) || val <= 0) return toast.error('Enter a valid multiplier');
            createMultiplierMutation.mutate({ roleId: newMultiplierRoleId, multiplier: val });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="label">Role</label>
            <select className="input" value={newMultiplierRoleId} onChange={(e) => setNewMultiplierRoleId(e.target.value)} required>
              <option value="">Select role…</option>
              {roles.filter((r) => r.name !== '@everyone' && !xpMultipliers.some((m) => m.roleId === r.id)).map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="label">Multiplier</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              className="input"
              value={newMultiplierValue}
              onChange={(e) => setNewMultiplierValue(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={createMultiplierMutation.isPending} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      </div>

      {/* XP Channel Multipliers */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-1">XP Channel Multipliers</h3>
        <p className="text-sm text-gray-400 mb-4">Give bonus XP for messages sent in specific channels. The highest matching multiplier applies.</p>
        {xpChannelMultipliers.length > 0 ? (
          <div className="space-y-2 mb-4">
            {xpChannelMultipliers.map((m) => {
              const ch = textChannels.find((c) => c.id === m.channelId);
              return (
                <div key={m.id} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-200">#{ch?.name ?? m.channelId}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-discord-blurple">{m.multiplier}×</span>
                    <button
                      onClick={() => deleteChannelMultiplierMutation.mutate(m.channelId)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-4">No channel XP multipliers configured.</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newChannelMultiplierChannelId) return toast.error('Select a channel');
            const val = parseFloat(newChannelMultiplierValue);
            if (isNaN(val) || val <= 0) return toast.error('Enter a valid multiplier');
            createChannelMultiplierMutation.mutate({ channelId: newChannelMultiplierChannelId, multiplier: val });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="label">Channel</label>
            <select
              className="input"
              value={newChannelMultiplierChannelId}
              onChange={(e) => setNewChannelMultiplierChannelId(e.target.value)}
              required
            >
              <option value="">Select channel…</option>
              {textChannels
                .filter((c) => !xpChannelMultipliers.some((m) => m.channelId === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
            </select>
          </div>
          <div className="w-28">
            <label className="label">Multiplier</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              className="input"
              value={newChannelMultiplierValue}
              onChange={(e) => setNewChannelMultiplierValue(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={createChannelMultiplierMutation.isPending}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      </div>

      {/* XP Decay */}
      <SettingsSection title="XP Decay" description="Automatically reduce XP for inactive members over time.">
        <Toggle
          label="Enable XP Decay"
          description="Members who haven't chatted recently will slowly lose XP"
          enabled={settings.xpDecayEnabled ?? false}
          onChange={(v) => { setSettings((s) => ({ ...s, xpDecayEnabled: v })); handleSave({ xpDecayEnabled: v }); }}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Inactivity Threshold (days)</label>
            <input
              type="number"
              className="input"
              value={settings.xpDecayDays ?? 30}
              min={7}
              max={365}
              onChange={(e) => setSettings((s) => ({ ...s, xpDecayDays: parseInt(e.target.value) }))}
              onBlur={() => handleSave({ xpDecayDays: settings.xpDecayDays })}
            />
            <p className="text-xs text-gray-500 mt-1">Days of inactivity before decay begins (7–365)</p>
          </div>
          <div>
            <label className="label">Decay Amount (%)</label>
            <input
              type="number"
              className="input"
              value={settings.xpDecayPercent ?? 5}
              min={1}
              max={50}
              onChange={(e) => setSettings((s) => ({ ...s, xpDecayPercent: parseInt(e.target.value) }))}
              onBlur={() => handleSave({ xpDecayPercent: settings.xpDecayPercent })}
            />
            <p className="text-xs text-gray-500 mt-1">% of XP lost per day of continued inactivity (1–50)</p>
          </div>
        </div>
      </SettingsSection>

      {/* Danger zone — Reset XP */}
      <div className="card border border-red-500/20 bg-red-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-red-400">Danger Zone</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              Permanently delete all XP and level data for every member in this server. This cannot be undone.
            </p>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 rounded-md border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
              >
                Reset All XP
              </button>
            ) : (
              <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/30 space-y-3">
                <p className="text-sm font-semibold text-red-300">
                  Are you sure? This will wipe all XP and levels for every member in this server. This action is irreversible.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => resetXpMutation.mutate()}
                    disabled={resetXpMutation.isPending}
                    className="px-4 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {resetXpMutation.isPending ? 'Resetting…' : 'Yes, reset all XP'}
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    disabled={resetXpMutation.isPending}
                    className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
