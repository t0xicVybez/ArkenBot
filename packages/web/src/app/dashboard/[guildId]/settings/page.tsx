'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi, personalizationApi, configTransferApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import type { GuildSettings } from '@arkenbot/shared';
import { Settings, Download, Upload } from 'lucide-react';

export default function SettingsPage() {
  const { guildId } = useParams() as { guildId: string };
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
      toast.success('Settings saved!');
      queryClient.invalidateQueries({ queryKey: ['settings', guildId] });
    },
    onError: () => toast.error('Failed to save settings.'),
  });

  const nicknameMutation = useMutation({
    mutationFn: (value: string | null) => personalizationApi.update(guildId, { nickname: value }),
    onSuccess: () => {
      toast.success('Nickname saved!');
      queryClient.invalidateQueries({ queryKey: ['personalization', guildId] });
    },
    onError: () => toast.error('Failed to save nickname.'),
  });

  const avatarMutation = useMutation({
    mutationFn: (value: string | null) => personalizationApi.update(guildId, { botAvatarUrl: value }),
    onSuccess: () => {
      toast.success('Bot avatar updated!');
      queryClient.invalidateQueries({ queryKey: ['personalization', guildId] });
    },
    onError: () => toast.error('Failed to update bot avatar.'),
  });

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Image must be under 3 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBotAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = (partial: Partial<GuildSettings>) => mutation.mutate(partial);

  const roles = (rolesRes?.data?.data ?? []) as Array<{ id: string; name: string }>;

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
      <div className="mb-6 flex items-center gap-3">
        <Settings className="w-6 h-6 text-discord-blurple" />
        <h1 className="text-2xl font-bold text-white">General Settings</h1>
      </div>

      <SettingsSection title="Bot Appearance" description="Customise how the bot appears in this server.">
        <div>
          <label className="label">Bot Nickname</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Leave blank to use the default bot name"
              maxLength={32}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <button
              className="btn-primary px-4"
              disabled={nicknameMutation.isPending}
              onClick={() => nicknameMutation.mutate(nickname.trim() || null)}
            >
              Save
            </button>
          </div>
        </div>
        <div>
          <label className="label">Bot Avatar (per-server)</label>
          <p className="text-xs text-gray-500 mb-2">
            Override the bot's avatar for this server only. PNG, JPG, GIF — max 3 MB.
          </p>
          <div className="flex items-center gap-3">
            {botAvatarUrl && (
              <img
                src={botAvatarUrl}
                alt="Bot avatar preview"
                className="w-12 h-12 rounded-full object-cover border border-gray-600"
              />
            )}
            <button
              className="btn-secondary px-4"
              onClick={() => avatarFileRef.current?.click()}
            >
              Upload Image
            </button>
            <button
              className="btn-primary px-4"
              disabled={avatarMutation.isPending}
              onClick={() => avatarMutation.mutate(botAvatarUrl)}
            >
              Save
            </button>
            {botAvatarUrl && (
              <button
                className="text-xs text-gray-500 hover:text-gray-300 underline"
                onClick={() => { setBotAvatarUrl(null); avatarMutation.mutate(null); }}
              >
                Remove
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

      <SettingsSection title="Roles" description="Configure auto-assign and mute roles.">
        <div>
          <label className="label">Auto-Role (given on join)</label>
          <select
            className="input"
            value={settings.autoRoleId ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, autoRoleId: e.target.value || undefined }))}
            onBlur={() => handleSave({ autoRoleId: settings.autoRoleId })}
          >
            <option value="">None</option>
            {roles.filter((r) => r.name !== '@everyone').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Mute Role (legacy — prefer Discord timeout)</label>
          <select
            className="input"
            value={settings.muteRoleId ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, muteRoleId: e.target.value || undefined }))}
            onBlur={() => handleSave({ muteRoleId: settings.muteRoleId })}
          >
            <option value="">None</option>
            {roles.filter((r) => r.name !== '@everyone').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </SettingsSection>

      <SettingsSection title="Embed Accent Colors" description="Customize the sidebar color of embeds sent by the bot in this server.">
        {(
          [
            { key: 'moderationColor', label: 'Moderation', defaultColor: '#EB459E' },
            { key: 'levelUpColor',    label: 'Level Up',   defaultColor: '#5865F2' },
            { key: 'musicColor',      label: 'Music',      defaultColor: '#5865F2' },
            { key: 'giveawayColor',   label: 'Giveaway',   defaultColor: '#F1C40F' },
            { key: 'birthdayColor',   label: 'Birthday',   defaultColor: '#FFC0CB' },
            { key: 'starboardColor',      label: 'Starboard',      defaultColor: '#F1C40F' },
            { key: 'reactionRolesColor', label: 'Reaction Roles', defaultColor: '#5865F2' },
            { key: 'streamAlertColor',      label: 'Stream Alerts',      defaultColor: '#5865F2' },
            { key: 'scheduledMessageColor', label: 'Scheduled Messages', defaultColor: '#5865F2' },
            { key: 'announcementColor',     label: 'Announcements',      defaultColor: '#5865F2' },
            { key: 'loggingColor',          label: 'Logs',               defaultColor: '#5865F2' },
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
              <label className="label mb-0 text-sm text-gray-300">{label}</label>
              <span className="text-xs text-gray-500 font-mono ml-auto">
                {isEmpty ? 'semantic' : currentValue}
              </span>
              {isLogging && !isEmpty && (
                <button
                  className="text-xs text-gray-500 hover:text-gray-300 underline"
                  onClick={() => { setSettings((s) => ({ ...s, loggingColor: '' })); handleSave({ loggingColor: '' }); }}
                >
                  Reset
                </button>
              )}
            </div>
          );
        })}
      </SettingsSection>

      <SettingsSection
        title="Backup & Restore"
        description="Download this server's full configuration as a JSON file, or restore a previous backup. User data (levels, warnings, cases) and secrets are never included."
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
                toast.success('Configuration downloaded');
              } catch {
                toast.error('Export failed');
              }
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download server config
          </button>

          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> Restore from backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (!confirm('Restoring a backup REPLACES the settings sections contained in the file. Continue?')) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  const res = await configTransferApi.import(guildId, parsed);
                  const counts = (res.data as { data?: { imported?: Record<string, number> } })?.data?.imported ?? {};
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  toast.success(`Backup restored — ${total} item${total === 1 ? '' : 's'} across ${Object.keys(counts).length} sections`);
                  queryClient.invalidateQueries();
                } catch (err) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  toast.error((err as any)?.response?.data?.error ?? 'Import failed — is this an ArkenBot config file?');
                }
              }}
            />
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Tip: download a backup before removing the bot — server data is permanently deleted 72 hours after removal.
          Monday.com alerts are restored with fresh webhook URLs that must be re-pasted into monday.com.
        </p>
      </SettingsSection>
    </div>
  );
}
