'use client';
/**
 * The Anti-Nuke page of the guild dashboard.
 */

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { ShieldAlert, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

type AntiNukeConfig = {
  enabled: boolean;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  banThreshold: number;
  action: 'deop' | 'kick' | 'ban';
  alertChannelId?: string | null;
  whitelistRoles: string[];
  whitelistUsers: string[];
};

const antiNukeApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/anti-nuke/config`),
  update: (guildId: string, data: Partial<AntiNukeConfig>) =>
    api.patch(`/guilds/${guildId}/anti-nuke/config`, data),
};

const DEFAULT_CONFIG: AntiNukeConfig = {
  enabled: false,
  channelDeleteThreshold: 3,
  roleDeleteThreshold: 3,
  banThreshold: 5,
  action: 'deop',
  alertChannelId: null,
  whitelistRoles: [],
  whitelistUsers: [],
};

export default function AntiNukePage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('antiNukePage');
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AntiNukeConfig>(DEFAULT_CONFIG);

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['anti-nuke-config', guildId],
    queryFn: () => antiNukeApi.get(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const [userIdInput, setUserIdInput] = useState('');

  useEffect(() => {
    const cfg = (configRes?.data as { data?: AntiNukeConfig })?.data;
    if (cfg) setConfig({ ...DEFAULT_CONFIG, ...cfg });
  }, [configRes]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<AntiNukeConfig>) => antiNukeApi.update(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['anti-nuke-config', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const allRoles = ((rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [])
    .filter((r) => r.id !== guildId && r.name !== '@everyone');

  const addTrustedRole = (roleId: string) => {
    if (config.whitelistRoles.includes(roleId)) return;
    setConfig((c) => ({ ...c, whitelistRoles: [...c.whitelistRoles, roleId] }));
  };
  const removeTrustedRole = (roleId: string) =>
    setConfig((c) => ({ ...c, whitelistRoles: c.whitelistRoles.filter((id) => id !== roleId) }));

  const addTrustedUser = () => {
    const id = userIdInput.trim();
    if (!/^\d{17,20}$/.test(id)) { toast.error(t('invalidUserId')); return; }
    if (!config.whitelistUsers.includes(id)) {
      setConfig((c) => ({ ...c, whitelistUsers: [...c.whitelistUsers, id] }));
    }
    setUserIdInput('');
  };
  const removeTrustedUser = (id: string) =>
    setConfig((c) => ({ ...c, whitelistUsers: c.whitelistUsers.filter((u) => u !== id) }));

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <div className="page-head">
        <div className="page-head-icon"><ShieldAlert className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {}
      <div className="card mb-6 border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">
          {t('infoText')}
        </p>
      </div>

      <SettingsSection title={t('title')} description={t('sectionDesc')}>
        <Toggle
          label={t('enable')}
          description={t('enableDesc')}
          enabled={config.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
      </SettingsSection>

      <SettingsSection title={t('thresholdsTitle')} description={t('thresholdsDesc')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">{t('channelDeleteThreshold')}</label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={config.channelDeleteThreshold}
              onChange={(e) => setConfig((c) => ({ ...c, channelDeleteThreshold: parseInt(e.target.value) || 3 }))}
            />
            <p className="text-xs text-gray-500 mt-1">{t('channelsDeleted')}</p>
          </div>
          <div>
            <label className="label">{t('roleDeleteThreshold')}</label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={config.roleDeleteThreshold}
              onChange={(e) => setConfig((c) => ({ ...c, roleDeleteThreshold: parseInt(e.target.value) || 3 }))}
            />
            <p className="text-xs text-gray-500 mt-1">{t('rolesDeleted')}</p>
          </div>
          <div>
            <label className="label">{t('massBanThreshold')}</label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={config.banThreshold}
              onChange={(e) => setConfig((c) => ({ ...c, banThreshold: parseInt(e.target.value) || 5 }))}
            />
            <p className="text-xs text-gray-500 mt-1">{t('bansIssued')}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('responseTitle')} description={t('responseDesc')}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('actionOnTrigger')}</label>
            <select
              className="input"
              value={config.action}
              onChange={(e) => setConfig((c) => ({ ...c, action: e.target.value as AntiNukeConfig['action'] }))}
            >
              <option value="deop">{t('actionDeop')}</option>
              <option value="kick">{t('actionKick')}</option>
              <option value="ban">{t('actionBan')}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('actionHelp')}</p>
          </div>
          <div>
            <label className="label">{t('alertChannel')}</label>
            <select
              className="input"
              value={config.alertChannelId ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, alertChannelId: e.target.value || null }))}
            >
              <option value="">{t('none')}</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('alertChannelHelp')}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('trustedTitle')} description={t('trustedDesc')}>
        <div className="card mb-4 border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
          <Info className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200/90">{t('ownerNote')}</p>
        </div>

        <div className="space-y-3">
          <label className="label">{t('trustedRolesLabel')}</label>
          <select
            className="input"
            value=""
            onChange={(e) => { if (e.target.value) addTrustedRole(e.target.value); }}
          >
            <option value="">{t('addTrustedRole')}</option>
            {allRoles
              .filter((r) => !config.whitelistRoles.includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {config.whitelistRoles.length === 0 && (
              <p className="text-gray-500 text-xs">{t('noTrustedRoles')}</p>
            )}
            {config.whitelistRoles.map((roleId) => {
              const role = allRoles.find((r) => r.id === roleId);
              return (
                <span
                  key={roleId}
                  className="inline-flex items-center gap-1 bg-discord-blurple/20 text-discord-blurple border border-discord-blurple/40 rounded-sm px-2 py-0.5 text-xs"
                >
                  @{role?.name ?? roleId}
                  <button onClick={() => removeTrustedRole(roleId)} className="hover:text-white ml-1"><X className="w-3 h-3" /></button>
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 mt-5">
          <label className="label">{t('trustedUsersLabel')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder={t('trustedUserPlaceholder')}
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTrustedUser(); } }}
            />
            <button type="button" onClick={addTrustedUser} className="btn-secondary whitespace-nowrap">
              {t('addTrustedUserBtn')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.whitelistUsers.length === 0 && (
              <p className="text-gray-500 text-xs">{t('noTrustedUsers')}</p>
            )}
            {config.whitelistUsers.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 bg-green-900/30 text-green-400 border border-green-700/50 rounded-sm px-2 py-0.5 text-xs font-mono"
              >
                {id}
                <button onClick={() => removeTrustedUser(id)} className="hover:text-white ml-1"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>
      </SettingsSection>

      <div className="mt-4">
        <button
          onClick={() => saveMutation.mutate(config)}
          disabled={saveMutation.isPending}
          className="btn-primary"
        >
          {saveMutation.isPending ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>
  );
}
