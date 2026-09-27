'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { valorantApi, guildsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Gamepad2, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];

interface Role { id: string; name: string }
interface Channel { id: string; name: string; type: number }
interface Cfg {
  enabled?: boolean; syncRolesEnabled?: boolean; rankRoles?: Record<string, string>;
  matchAlertsEnabled?: boolean; alertChannelId?: string | null; leaderboardEnabled?: boolean;
  presenceEnabled?: boolean; presenceRoleId?: string | null;
}

export default function ValorantDashPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('valorantDashPage');
  const qc = useQueryClient();

  const { data: cfgRes } = useQuery({ queryKey: ['valorant-config', guildId], queryFn: () => valorantApi.getConfig(guildId) });
  const { data: rolesRes } = useQuery({ queryKey: ['roles', guildId], queryFn: () => guildsApi.roles(guildId) });
  const { data: chRes } = useQuery({ queryKey: ['channels', guildId], queryFn: () => guildsApi.channels(guildId) });

  const cfg = (cfgRes?.data as { data?: Cfg } | undefined)?.data;
  const roles = ((rolesRes?.data?.data ?? []) as Role[]).filter((r) => r.name !== '@everyone');
  const channels = ((chRes?.data?.data ?? []) as Channel[]).filter((c) => c.type === 0);

  const [enabled, setEnabled] = useState(false);
  const [syncRoles, setSyncRoles] = useState(true);
  const [rankRoles, setRankRoles] = useState<Record<string, string>>({});
  const [matchAlerts, setMatchAlerts] = useState(false);
  const [alertChannel, setAlertChannel] = useState('');
  const [leaderboard, setLeaderboard] = useState(true);
  const [presence, setPresence] = useState(false);
  const [presenceRole, setPresenceRole] = useState('');
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !cfg) return;
    setEnabled(!!cfg.enabled);
    setSyncRoles(cfg.syncRolesEnabled !== false);
    setRankRoles(cfg.rankRoles ?? {});
    setMatchAlerts(!!cfg.matchAlertsEnabled);
    setAlertChannel(cfg.alertChannelId ?? '');
    setLeaderboard(cfg.leaderboardEnabled !== false);
    setPresence(!!cfg.presenceEnabled);
    setPresenceRole(cfg.presenceRoleId ?? '');
    setSeeded(true);
  }, [seeded, cfg]);

  const mut = useMutation({
    mutationFn: (data: object) => valorantApi.updateConfig(guildId, data),
    onSuccess: () => { toast.success(t('saved')); qc.invalidateQueries({ queryKey: ['valorant-config', guildId] }); },
    onError: () => toast.error(t('saveError')),
  });
  const save = () => mut.mutate({
    enabled, syncRolesEnabled: syncRoles, rankRoles,
    matchAlertsEnabled: matchAlerts, alertChannelId: alertChannel || null,
    leaderboardEnabled: leaderboard, presenceEnabled: presence, presenceRoleId: presenceRole || null,
  });

  const RoleSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('noRole')}</option>
      {roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
    </select>
  );

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Gamepad2 className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Dormant-until-approved notice */}
      <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-gray-300">{t('pendingNotice')}</p>
      </div>

      <div className="space-y-5">
        <div className="card">
          <Toggle label={t('enable')} description={t('enableDesc')} enabled={enabled} onChange={setEnabled} />
        </div>

        {enabled && (
          <>
            {/* Rank roles */}
            <div className="card space-y-4">
              <Toggle label={t('syncRoles')} description={t('syncRolesDesc')} enabled={syncRoles} onChange={setSyncRoles} />
              {syncRoles && (
                <div className="space-y-2">
                  <label className="label">{t('rankRoleMap')}</label>
                  {TIERS.map((tier) => (
                    <div key={tier} className="grid grid-cols-[110px_1fr] items-center gap-3">
                      <span className="text-sm font-medium text-white">{tier}</span>
                      <RoleSelect value={rankRoles[tier] ?? ''} onChange={(v) => setRankRoles((m) => ({ ...m, [tier]: v }))} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Match alerts */}
            <div className="card space-y-4">
              <Toggle label={t('matchAlerts')} description={t('matchAlertsDesc')} enabled={matchAlerts} onChange={setMatchAlerts} />
              {matchAlerts && (
                <div>
                  <label className="label">{t('alertChannel')}</label>
                  <select className="input" value={alertChannel} onChange={(e) => setAlertChannel(e.target.value)}>
                    <option value="">{t('selectChannel')}</option>
                    {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="card">
              <Toggle label={t('leaderboard')} description={t('leaderboardDesc')} enabled={leaderboard} onChange={setLeaderboard} />
            </div>

            {/* Presence */}
            <div className="card space-y-4">
              <Toggle label={t('presence')} description={t('presenceDesc')} enabled={presence} onChange={setPresence} />
              {presence && (
                <div>
                  <label className="label">{t('presenceRole')}</label>
                  <RoleSelect value={presenceRole} onChange={setPresenceRole} />
                </div>
              )}
            </div>
          </>
        )}

        <button onClick={save} disabled={mut.isPending} className="btn-primary">
          {mut.isPending ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  );
}
