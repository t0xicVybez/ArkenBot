'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi, personalizationApi, configTransferApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import type { GuildSettings } from '@arkenbot/shared';
import { Settings, Download, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('serverSettingsPage');
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<GuildSettings>>({});
  const [nickname, setNickname] = useState('');
  const [botAvatarUrl, setBotAvatarUrl] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: personalizationRes } = useQuery({
    queryKey: ['personalization', guildId],
    queryFn: () => personalizationApi.get(guildId),
  });

  useEffect(() => {
    if (settingsRes?.data?.data) setSettings(settingsRes.data.data);
  }, [settingsRes]);

  useEffect(() => {
    if (personalizationRes?.data?.data) {
      setNickname(personalizationRes.data.data.nickname ?? '');
      setBotAvatarUrl(personalizationRes.data.data.botAvatarUrl ?? null);
    }
  }, [personalizationRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<GuildSettings>) => settingsApi.update(guildId, data),
    onSuccess: () => {
      toast.success(t('settingsSaved'));
      queryClient.invalidateQueries({ queryKey: ['settings', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const nicknameMutation = useMutation({
    mutationFn: (value: string | null) => personalizationApi.update(guildId, { nickname: value }),
    onSuccess: () => {
      toast.success(t('nicknameSaved'));
      queryClient.invalidateQueries({ queryKey: ['personalization', guildId] });
    },
    onError: () => toast.error(t('nicknameError')),
  });

  const avatarMutation = useMutation({
    mutationFn: (value: string | null) => personalizationApi.update(guildId, { botAvatarUrl: value }),
    onSuccess: () => {
      toast.success(t('avatarUpdated'));
      queryClient.invalidateQueries({ queryKey: ['personalization', guildId] });
    },
    onError: () => toast.error(t('avatarError')),
  });

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error(t('imageTooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBotAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = (partial: Partial<GuildSettings>) => mutation.mutate(partial);

  const roles = (rolesRes?.data?.data ?? []) as Array<{ id: string; name: string }>;
  const textChannels = ((channelsRes?.data?.data ?? []) as Array<{ id: string; name: string; type: number }>).filter((c) => c.type === 0);

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card h-32 bg-gray-700" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Settings className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <SettingsSection title={t('botAppearance')} description={t('botAppearanceDesc')}>
        <div>
          <label className="label">{t('botNickname')}</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t('nicknamePlaceholder')}
              maxLength={32}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <button
              className="btn-primary px-4"
              disabled={nicknameMutation.isPending}
              onClick={() => nicknameMutation.mutate(nickname.trim() || null)}
            >
              {t('save')}
            </button>
          </div>
        </div>
        <div>
          <label className="label">{t('botAvatar')}</label>
          <p className="text-xs text-gray-500 mb-2">
            {t('botAvatarDesc')}
          </p>
          <div className="flex items-center gap-3">
            {botAvatarUrl && (
              <img
                src={botAvatarUrl}
                alt={t('avatarPreviewAlt')}
                className="w-12 h-12 rounded-full object-cover border border-gray-600"
              />
            )}
            <button
              className="btn-secondary px-4"
              onClick={() => avatarFileRef.current?.click()}
            >
              {t('uploadImage')}
            </button>
            <button
              className="btn-primary px-4"
              disabled={avatarMutation.isPending}
              onClick={() => avatarMutation.mutate(botAvatarUrl)}
            >
              {t('save')}
            </button>
            {botAvatarUrl && (
              <button
                className="text-xs text-gray-500 hover:text-gray-300 underline"
                onClick={() => { setBotAvatarUrl(null); avatarMutation.mutate(null); }}
              >
                {t('remove')}
              </button>
            )}
          </div>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarFile}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={t('rolesTitle')} description={t('rolesDesc')}>
        <div>
          <label className="label">{t('autoRole')}</label>
          <select
            className="input"
            value={settings.autoRoleId ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, autoRoleId: e.target.value || undefined }))}
            onBlur={() => handleSave({ autoRoleId: settings.autoRoleId })}
          >
            <option value="">{t('none')}</option>
            {roles.filter((r) => r.name !== '@everyone').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('muteRole')}</label>
          <select
            className="input"
            value={settings.muteRoleId ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, muteRoleId: e.target.value || undefined }))}
            onBlur={() => handleSave({ muteRoleId: settings.muteRoleId })}
          >
            <option value="">{t('none')}</option>
            {roles.filter((r) => r.name !== '@everyone').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </SettingsSection>

      <SettingsSection title={t('permAlertsTitle')} description={t('permAlertsDesc')}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 mt-1 accent-discord-blurple"
            checked={settings.permissionAlertsEnabled ?? true}
            onChange={(e) => {
              const v = e.target.checked;
              setSettings((s) => ({ ...s, permissionAlertsEnabled: v }));
              handleSave({ permissionAlertsEnabled: v });
            }}
          />
          <span>
            <span className="label !mb-0">{t('permAlertsEnabled')}</span>
            <span className="block text-sm text-[var(--text-muted)]">{t('permAlertsEnabledDesc')}</span>
          </span>
        </label>
        <div>
          <label className="label">{t('permAlertRole')}</label>
          <select
            className="input"
            value={settings.permissionAlertRoleId ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, permissionAlertRoleId: e.target.value || undefined }))}
            onBlur={() => handleSave({ permissionAlertRoleId: settings.permissionAlertRoleId })}
          >
            <option value="">{t('none')}</option>
            {roles.filter((r) => r.name !== '@everyone').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <p className="text-sm text-[var(--text-muted)] mt-1">{t('permAlertRoleDesc')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('highlightsTitle')} description={t('highlightsDesc')}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 mt-1 accent-discord-blurple"
            checked={settings.highlightsEnabled ?? false}
            onChange={(e) => {
              const v = e.target.checked;
              setSettings((s) => ({ ...s, highlightsEnabled: v }));
              handleSave({ highlightsEnabled: v });
            }}
          />
          <span>
            <span className="label !mb-0">{t('highlightsEnabled')}</span>
            <span className="block text-sm text-[var(--text-muted)]">{t('highlightsEnabledDesc')}</span>
          </span>
        </label>
        {settings.highlightsEnabled && (
          <div>
            <label className="label">{t('highlightsChannel')}</label>
            <select
              className="input"
              value={settings.highlightsChannelId ?? ''}
              onChange={(e) => { const v = e.target.value || null; setSettings((s) => ({ ...s, highlightsChannelId: v })); handleSave({ highlightsChannelId: v }); }}
            >
              <option value="">{t('none')}</option>
              {textChannels.map((c) => (<option key={c.id} value={c.id}>#{c.name}</option>))}
            </select>
            <p className="text-sm text-[var(--text-muted)] mt-1">{t('highlightsChannelDesc')}</p>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('embedColorsTitle')} description={t('embedColorsDesc')}>
        {(
          [
            { key: 'moderationColor', label: 'color_moderation', defaultColor: '#EB459E' },
            { key: 'levelUpColor',    label: 'color_levelUp',   defaultColor: '#5865F2' },
            { key: 'musicColor',      label: 'color_music',      defaultColor: '#5865F2' },
            { key: 'giveawayColor',   label: 'color_giveaway',   defaultColor: '#F1C40F' },
            { key: 'birthdayColor',   label: 'color_birthday',   defaultColor: '#FFC0CB' },
            { key: 'starboardColor',      label: 'color_starboard',      defaultColor: '#F1C40F' },
            { key: 'reactionRolesColor', label: 'color_reactionRoles', defaultColor: '#5865F2' },
            { key: 'streamAlertColor',      label: 'color_streamAlerts',      defaultColor: '#5865F2' },
            { key: 'scheduledMessageColor', label: 'color_scheduledMessages', defaultColor: '#5865F2' },
            { key: 'announcementColor',     label: 'color_announcements',      defaultColor: '#5865F2' },
            { key: 'loggingColor',          label: 'color_logs',               defaultColor: '#5865F2' },
          ] as Array<{ key: keyof GuildSettings; label: string; defaultColor: string }>
        ).map(({ key, label, defaultColor }) => {
          const currentValue = (settings[key] as string | undefined) ?? defaultColor;
          const isLogging = key === 'loggingColor';
          const isEmpty = currentValue === '';
          return (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                className="w-10 h-10 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5"
                value={isEmpty ? '#5865F2' : currentValue}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                onBlur={() => handleSave({ [key]: (settings[key] as string | undefined) ?? defaultColor })}
              />
              <label className="label mb-0 text-sm text-gray-300">{t(label)}</label>
              <span className="text-xs text-gray-500 font-mono ml-auto">
                {isEmpty ? t('semantic') : currentValue}
              </span>
              {isLogging && !isEmpty && (
                <button
                  className="text-xs text-gray-500 hover:text-gray-300 underline"
                  onClick={() => { setSettings((s) => ({ ...s, loggingColor: '' })); handleSave({ loggingColor: '' }); }}
                >
                  {t('reset')}
                </button>
              )}
            </div>
          );
        })}
      </SettingsSection>

      <SettingsSection
        danger
        title={t('dangerTitle')}
        description={t('dangerDesc')}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={async () => {
              try {
                const res = await configTransferApi.export(guildId);
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `arkenbot-config-${guildId}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(t('configDownloaded'));
              } catch {
                toast.error(t('exportFailed'));
              }
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> {t('downloadConfig')}
          </button>

          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> {t('restoreBackup')}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (!confirm(t('confirmRestore'))) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  const res = await configTransferApi.import(guildId, parsed);
                  const counts = (res.data as { data?: { imported?: Record<string, number> } })?.data?.imported ?? {};
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  toast.success(t('backupRestored', { count: total, sections: Object.keys(counts).length }));
                  queryClient.invalidateQueries();
                } catch (err) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  toast.error((err as any)?.response?.data?.error ?? t('importFailed'));
                }
              }}
            />
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {t('dangerTip')}
        </p>
      </SettingsSection>
    </div>
  );
}
