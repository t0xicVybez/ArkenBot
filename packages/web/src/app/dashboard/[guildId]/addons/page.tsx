'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addonsApi, guildsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Puzzle, Plus, Trash2, Settings, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { AddonSettingSchema } from '@arkenbot/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddonRecord {
  id: string;
  name: string;
  displayName: string;
  description: string;
  author: string;
  version: string;
  verified: boolean;
  manifest?: { settings?: AddonSettingSchema[] };
}

interface Channel { id: string; name: string; type: number }
interface Role    { id: string; name: string; color: number }

// ─── Settings Modal ───────────────────────────────────────────────────────────

function AddonSettingsModal({
  addon,
  guildId,
  onClose,
}: {
  addon: AddonRecord;
  guildId: string;
  onClose: () => void;
}) {
  const schema = addon.manifest?.settings ?? [];
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  // Fetch current saved settings
  const { data: settingsRes } = useQuery({
    queryKey: ['addon-settings', guildId, addon.id],
    queryFn: () => addonsApi.getSettings(guildId, addon.id),
  });

  // Fetch channels + roles only if the schema needs them
  const needsChannel = schema.some((s) => s.type === 'channel');
  const needsRole    = schema.some((s) => s.type === 'role');

  const { data: channelsRes } = useQuery({
    queryKey: ['guild-channels', guildId],
    queryFn:  () => guildsApi.channels(guildId),
    enabled:  needsChannel,
  });
  const { data: rolesRes } = useQuery({
    queryKey: ['guild-roles', guildId],
    queryFn:  () => guildsApi.roles(guildId),
    enabled:  needsRole,
  });

  const channels = (channelsRes?.data?.data ?? []) as Channel[];
  const roles    = (rolesRes?.data?.data    ?? []) as Role[];

  // Populate form once settings arrive, seeding defaults for missing keys
  useEffect(() => {
    if (settingsRes && !loaded) {
      const saved = (settingsRes.data?.data ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = {};
      for (const field of schema) {
        merged[field.key] = saved[field.key] !== undefined ? saved[field.key] : (field.default ?? '');
      }
      setValues(merged);
      setLoaded(true);
    }
  }, [settingsRes, loaded, schema]);

  const saveMutation = useMutation({
    mutationFn: () => addonsApi.updateSettings(guildId, addon.id, values),
    onSuccess: () => { toast.success('Settings saved!'); onClose(); },
    onError:   () => toast.error('Failed to save settings.'),
  });

  const set = (key: string, value: unknown) =>
    setValues((prev: Record<string, unknown>) => ({ ...prev, [key]: value }));

  if (!loaded) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="card w-full max-w-md p-6">
          <p className="text-gray-400 text-center">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (schema.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
        <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">{addon.displayName} — Settings</h2>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
          </div>
          <p className="text-gray-400 text-sm">This addon has no configurable settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold text-lg">{addon.displayName}</h2>
            <p className="text-gray-400 text-xs">Configure addon settings for this server</p>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          {schema.map((field) => (
            <div key={field.key}>
              <label className="label">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {field.description && (
                <p className="text-gray-500 text-xs mb-1">{field.description}</p>
              )}

              {field.type === 'string' && (
                <input
                  className="input"
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              )}

              {field.type === 'number' && (
                <input
                  className="input"
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, Number(e.target.value))}
                />
              )}

              {field.type === 'boolean' && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-11 h-6 rounded-full transition-colors ${
                      values[field.key] ? 'bg-discord-blurple' : 'bg-gray-600'
                    } relative`}
                    onClick={() => set(field.key, !values[field.key])}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        values[field.key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-gray-300 text-sm">
                    {values[field.key] ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              )}

              {field.type === 'channel' && (
                <select
                  className="input"
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                >
                  <option value="">— Select a channel —</option>
                  {channels
                    .filter((c) => c.type === 0)
                    .map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                </select>
              )}

              {field.type === 'role' && (
                <select
                  className="input"
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                >
                  <option value="">— Select a role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>@{r.name}</option>
                  ))}
                </select>
              )}

              {field.type === 'color' && (
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                    value={String(values[field.key] ?? '#5865F2')}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                  <input
                    className="input flex-1 font-mono"
                    value={String(values[field.key] ?? '')}
                    onChange={(e) => set(field.key, e.target.value)}
                    placeholder="#5865F2"
                  />
                </div>
              )}

              {field.type === 'select' && field.options && (
                <select
                  className="input"
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                >
                  <option value="">— Select —</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-gray-700/50">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary flex-1"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AddonsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [configuring, setConfiguring] = useState<AddonRecord | null>(null);

  const { data: allAddonsRes } = useQuery({
    queryKey: ['addons-all'],
    queryFn: () => addonsApi.listAll(),
  });

  const { data: guildAddonsRes } = useQuery({
    queryKey: ['addons-guild', guildId],
    queryFn: () => addonsApi.listGuild(guildId),
  });

  const installMutation = useMutation({
    mutationFn: (addonId: string) => addonsApi.install(guildId, addonId),
    onSuccess: () => {
      toast.success('Addon installed!');
      queryClient.invalidateQueries({ queryKey: ['addons-guild', guildId] });
    },
    onError: () => toast.error('Failed to install addon.'),
  });

  const uninstallMutation = useMutation({
    mutationFn: (addonId: string) => addonsApi.uninstall(guildId, addonId),
    onSuccess: () => {
      toast.success('Addon uninstalled.');
      queryClient.invalidateQueries({ queryKey: ['addons-guild', guildId] });
    },
    onError: () => toast.error('Failed to uninstall addon.'),
  });

  const allAddons = (allAddonsRes?.data?.data ?? []) as AddonRecord[];
  const guildAddons = (guildAddonsRes?.data?.data ?? []) as Array<{
    addonId: string; addon: { id: string; name: string; displayName: string };
  }>;
  const installedIds = new Set(guildAddons.map((ga) => ga.addonId));

  return (
    <>
      {configuring && (
        <AddonSettingsModal
          addon={configuring}
          guildId={guildId}
          onClose={() => setConfiguring(null)}
        />
      )}

      <div className="p-3 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <Puzzle className="w-6 h-6 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold text-white">Addons Marketplace</h1>
            <p className="text-gray-400 text-sm">{installedIds.size} installed</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allAddons.map((addon) => {
            const installed = installedIds.has(addon.id);
            return (
              <div key={addon.id} className="card hover:border-discord-blurple/40 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold">{addon.displayName}</h3>
                      {addon.verified && (
                        <span className="badge-info text-xs">✓ Verified</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">v{addon.version} by {addon.author}</p>
                  </div>
                  {installed && (
                    <span className="badge-success text-xs">Installed</span>
                  )}
                </div>

                <p className="text-gray-400 text-sm mb-4 line-clamp-2">{addon.description}</p>

                <div className="flex gap-2">
                  {installed ? (
                    <>
                      <button
                        onClick={() => setConfiguring(addon)}
                        className="btn-secondary flex-1 text-xs py-1.5"
                      >
                        <Settings className="w-3 h-3" />
                        Configure
                      </button>
                      <button
                        onClick={() => uninstallMutation.mutate(addon.id)}
                        className="btn-danger text-xs py-1.5 px-3"
                        title="Uninstall"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => installMutation.mutate(addon.id)}
                      className="btn-primary flex-1 text-xs py-1.5"
                    >
                      <Plus className="w-3 h-3" />
                      Install
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {allAddons.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Puzzle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No addons available yet.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
