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

const levelRolesApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/level-roles`),
  create: (guildId: string, data: { level: number; roleId: string }) =>
    api.post(`/guilds/${guildId}/level-roles`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/level-roles/${id}`),
};

const leaderboardApi = {
  reset: (guildId: string) => api.delete(`/guilds/${guildId}/leaderboard`),
};


export default function LevelingPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<GuildSettings>>({});
  const [newLevel, setNewLevel] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
      <div className="mb-6 flex items-center gap-3">
        <TrendingUp className="w-6 h-6 text-discord-blurple" />
        <h1 className="text-2xl font-bold text-white">Leveling</h1>
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
          <div className="overflow-hidden rounded-lg border border-gray-700/50">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-discord-darkest-bg">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Level</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Role</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {sortedLevelRoles.map((lr) => {
                  const role = roles.find((r) => r.id === lr.roleId);
                  return (
                    <tr key={lr.id} className="hover:bg-discord-dark-bg/30 transition-colors">
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
