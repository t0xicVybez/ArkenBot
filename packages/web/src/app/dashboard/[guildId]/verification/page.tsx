'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { ShieldCheck, Info } from 'lucide-react';

type VerificationConfig = {
  enabled: boolean;
  pendingRoleId?: string | null;
  memberRoleId?: string | null;
  verifyChannelId?: string | null;
};

const verificationApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/verification/config`),
  update: (guildId: string, data: Partial<VerificationConfig>) =>
    api.patch(`/guilds/${guildId}/verification/config`, data),
};

const DEFAULT_CONFIG: VerificationConfig = {
  enabled: false,
  pendingRoleId: null,
  memberRoleId: null,
  verifyChannelId: null,
};

export default function VerificationPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<VerificationConfig>(DEFAULT_CONFIG);

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['verification-config', guildId],
    queryFn: () => verificationApi.get(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  useEffect(() => {
    const cfg = (configRes?.data as { data?: VerificationConfig })?.data;
    if (cfg) setConfig({ ...DEFAULT_CONFIG, ...cfg });
  }, [configRes]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<VerificationConfig>) => verificationApi.update(guildId, data),
    onSuccess: () => {
      toast.success('Verification config saved!');
      queryClient.invalidateQueries({ queryKey: ['verification-config', guildId] });
    },
    onError: () => toast.error('Failed to save config'),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const roles = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
  const assignableRoles = roles.filter((r) => r.name !== '@everyone');

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <div className="page-head">
        <div className="page-head-icon"><ShieldCheck className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Verification Gate</h1>
          <div className="page-head-desc">Require new members to verify before accessing the server.</div>
        </div>
      </div>

      {/* Info card */}
      <div className="card mb-6 border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">
          When enabled, new members receive the Pending Role and can only see the verify channel.
          Clicking Verify gives them the Member Role and access to the rest of the server.
        </p>
      </div>

      <SettingsSection title="Verification Gate" description="Enable the verification system for new members.">
        <Toggle
          label="Enable Verification"
          description="New members must verify before accessing server channels"
          enabled={config.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
      </SettingsSection>

      <SettingsSection title="Roles & Channel" description="Configure the roles and channel used for verification.">
        <div className="space-y-3">
          <div>
            <label className="label">Pending Role</label>
            <select
              className="input"
              value={config.pendingRoleId ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, pendingRoleId: e.target.value || null }))}
            >
              <option value="">None</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Role given to new members when they join (pre-verification).</p>
          </div>
          <div>
            <label className="label">Member Role</label>
            <select
              className="input"
              value={config.memberRoleId ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, memberRoleId: e.target.value || null }))}
            >
              <option value="">None</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Role given after a member verifies successfully.</p>
          </div>
          <div>
            <label className="label">Verify Channel</label>
            <select
              className="input"
              value={config.verifyChannelId ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, verifyChannelId: e.target.value || null }))}
            >
              <option value="">None</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Channel where the verify button panel is displayed.</p>
          </div>
        </div>
      </SettingsSection>

      <div className="mt-4">
        <button
          onClick={() => saveMutation.mutate(config)}
          disabled={saveMutation.isPending}
          className="btn-primary"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
