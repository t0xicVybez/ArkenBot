'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ticketsApi, guildsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Settings, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Toggle } from '@/components/Toggle';
import { useTranslations } from 'next-intl';

interface SlaLevel { hours: number; pingRoleId?: string; message?: string; }

interface GuildTicketConfig {
  blacklistedUsers: string[];
  transcriptChannelId?: string;
  slaHours?: number;
  webhookUrl?: string;
  staffNotifyChannelId?: string;
  staffNotifyRoleId?: string;
  ratingWindowMinutes?: number;
  autoAssign?: boolean;
  slaLevels?: SlaLevel[];
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
    </div>
  );
}

function BlacklistInput({ users, onChange }: { users: string[]; onChange: (u: string[]) => void }) {
  const t = useTranslations('ticketSettingsPage');
  const [input, setInput] = useState('');
  const add = () => {
    const id = input.trim().replace(/\D/g, '');
    if (!id || users.includes(id)) { setInput(''); return; }
    onChange([...users, id]);
    setInput('');
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input flex-1 text-sm font-mono" placeholder={t('pasteUserId')} value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="btn-secondary text-sm px-3">{t('add')}</button>
      </div>
      {users.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {users.map((id) => (
            <span key={id} className="flex items-center gap-1 bg-gray-700/50 text-gray-200 text-xs font-mono rounded px-2 py-1">
              {id}
              <button type="button" onClick={() => onChange(users.filter((u) => u !== id))} className="text-gray-500 hover:text-red-400 ml-1">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SlaLevelsEditor({ levels, roles, onChange }: { levels: SlaLevel[]; roles: { id: string; name: string }[]; onChange: (l: SlaLevel[]) => void }) {
  const t = useTranslations('ticketSettingsPage');
  const [newHours, setNewHours] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newMsg, setNewMsg] = useState('');

  const add = () => {
    const h = parseInt(newHours);
    if (!h || h <= 0) { toast.error(t('enterValidHours')); return; }
    if (levels.some((l) => l.hours === h)) { toast.error(t('levelExists')); return; }
    onChange([...levels, { hours: h, pingRoleId: newRole || undefined, message: newMsg.trim() || undefined }].sort((a, b) => a.hours - b.hours));
    setNewHours(''); setNewRole(''); setNewMsg('');
  };

  return (
    <div className="space-y-3">
      {levels.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="bg-[var(--bg-base)]">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-gray-400 uppercase">{t('colHours')}</th>
                <th className="text-left px-3 py-2 text-xs text-gray-400 uppercase">{t('colPingRole')}</th>
                <th className="text-left px-3 py-2 text-xs text-gray-400 uppercase">{t('colCustomMessage')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {levels.map((lvl) => (
                <tr key={lvl.hours} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-yellow-400">{lvl.hours}h</td>
                  <td className="px-3 py-2 text-gray-300">{roles.find((r) => r.id === lvl.pingRoleId)?.name ?? lvl.pingRoleId ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate">{lvl.message ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onChange(levels.filter((l) => l.hours !== lvl.hours))} className="text-gray-500 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label text-xs">{t('colHours')}</label>
          <input type="number" min={1} className="input text-sm" placeholder={t('eg6')} value={newHours} onChange={(e) => setNewHours(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">{t('pingRoleOptional')}</label>
          <select className="input text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="">{t('none')}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">{t('customMessageOptional')}</label>
          <input className="input text-sm" placeholder={t('leaveBlankDefault')} value={newMsg} onChange={(e) => setNewMsg(e.target.value)} />
        </div>
      </div>
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-discord-blurple hover:text-blue-400 transition-colors">
        <Plus className="w-4 h-4" /> {t('addSlaLevel')}
      </button>
    </div>
  );
}

export default function TicketSettingsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('ticketSettingsPage');
  const queryClient = useQueryClient();

  const { data: configRes, isLoading } = useQuery({ queryKey: ['tickets-config', guildId], queryFn: () => ticketsApi.getConfig(guildId) });
  const { data: channelsRes } = useQuery({ queryKey: ['channels', guildId], queryFn: () => guildsApi.channels(guildId) });
  const { data: rolesRes } = useQuery({ queryKey: ['roles', guildId], queryFn: () => guildsApi.roles(guildId) });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const roles: { id: string; name: string }[] = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];

  const [draft, setDraft] = useState<GuildTicketConfig>({
    blacklistedUsers: [],
    transcriptChannelId: '',
    slaHours: 0,
    webhookUrl: '',
    staffNotifyChannelId: '',
    staffNotifyRoleId: '',
    ratingWindowMinutes: 5,
    autoAssign: false,
    slaLevels: [],
  });

  useEffect(() => {
    const cfg = configRes?.data?.data as GuildTicketConfig | undefined;
    if (cfg) setDraft({
      blacklistedUsers: cfg.blacklistedUsers ?? [],
      transcriptChannelId: cfg.transcriptChannelId ?? '',
      slaHours: cfg.slaHours ?? 0,
      webhookUrl: cfg.webhookUrl ?? '',
      staffNotifyChannelId: cfg.staffNotifyChannelId ?? '',
      staffNotifyRoleId: cfg.staffNotifyRoleId ?? '',
      ratingWindowMinutes: cfg.ratingWindowMinutes ?? 5,
      autoAssign: cfg.autoAssign ?? false,
      slaLevels: cfg.slaLevels ?? [],
    });
  }, [configRes]);

  const set = <K extends keyof GuildTicketConfig>(key: K, value: GuildTicketConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => ticketsApi.updateConfig(guildId, {
      ...draft,
      transcriptChannelId: draft.transcriptChannelId || undefined,
      webhookUrl: draft.webhookUrl || undefined,
      staffNotifyChannelId: draft.staffNotifyChannelId || undefined,
      staffNotifyRoleId: draft.staffNotifyRoleId || undefined,
      slaHours: draft.slaHours ?? 0,
      ratingWindowMinutes: draft.ratingWindowMinutes ?? 5,
    }),
    onSuccess: () => { toast.success(t('saved')); queryClient.invalidateQueries({ queryKey: ['tickets-config', guildId] }); },
    onError: () => toast.error(t('saveError')),
  });

  if (isLoading) return <div className="p-3 sm:p-6 text-gray-400">{t('loading')}</div>;

  return (
    <div className="p-3 sm:p-6 max-w-2xl space-y-6">
      <div className="page-head">
        <Link href={`/dashboard/${guildId}/tickets`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="page-head-icon"><Settings className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* General */}
      <div className="card space-y-5">
        <h2 className="text-white font-semibold border-b border-[var(--border-subtle)] pb-2">{t('general')}</h2>
        <Row label={t('transcriptChannel')} hint={t('transcriptHint')}>
          <select className="input" value={draft.transcriptChannelId ?? ''} onChange={(e) => set('transcriptChannelId', e.target.value)}>
            <option value="">{t('disabled')}</option>
            {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </Row>
        <Row label={t('webhookUrl')} hint={t('webhookHint')}>
          <input className="input text-sm" placeholder="https://your-webhook.com/tickets" value={draft.webhookUrl ?? ''} onChange={(e) => set('webhookUrl', e.target.value)} />
        </Row>
        <Row label={t('ratingWindow')} hint={t('ratingWindowHint')}>
          <input type="number" min={1} max={1440} className="input w-28" value={draft.ratingWindowMinutes ?? 5} onChange={(e) => set('ratingWindowMinutes', Math.max(1, parseInt(e.target.value) || 5))} />
        </Row>
      </div>

      {/* Staff Notifications */}
      <div className="card space-y-5">
        <h2 className="text-white font-semibold border-b border-[var(--border-subtle)] pb-2">{t('staffNotifications')}</h2>
        <p className="text-gray-400 text-sm">{t('staffNotifyDesc')}</p>
        <Row label={t('notificationChannel')}>
          <select className="input" value={draft.staffNotifyChannelId ?? ''} onChange={(e) => set('staffNotifyChannelId', e.target.value)}>
            <option value="">{t('disabled')}</option>
            {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </Row>
        <Row label={t('pingRole')} hint={t('pingRoleHint')}>
          <select className="input" value={draft.staffNotifyRoleId ?? ''} onChange={(e) => set('staffNotifyRoleId', e.target.value)}>
            <option value="">{t('noPing')}</option>
            {roles.filter((r) => r.name !== '@everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Row>
        <Row label={t('autoAssign')} hint={t('autoAssignHint')}>
          <div className="mt-1">
            <Toggle enabled={draft.autoAssign ?? false} onChange={(v) => set('autoAssign', v)} />
          </div>
        </Row>
      </div>

      {/* SLA */}
      <div className="card space-y-5">
        <h2 className="text-white font-semibold border-b border-[var(--border-subtle)] pb-2">{t('slaEscalation')}</h2>
        <p className="text-gray-400 text-sm">{t('slaEscalationDesc')}</p>
        <Row label={t('legacySla')} hint={t('legacySlaHint')}>
          <input type="number" min={0} max={720} className="input w-28" value={draft.slaHours ?? 0} onChange={(e) => set('slaHours', Number(e.target.value))} />
        </Row>
        <div>
          <label className="label">{t('slaLevels')}</label>
          <SlaLevelsEditor levels={draft.slaLevels ?? []} roles={roles.filter((r) => r.name !== '@everyone')} onChange={(l) => set('slaLevels', l)} />
        </div>
      </div>

      {/* Blacklist */}
      <div className="card space-y-5">
        <h2 className="text-white font-semibold border-b border-[var(--border-subtle)] pb-2">{t('blacklistedUsers')}</h2>
        <p className="text-gray-400 text-sm">{t('blacklistDesc')}</p>
        <BlacklistInput users={draft.blacklistedUsers} onChange={(u) => set('blacklistedUsers', u)} />
      </div>

      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary disabled:opacity-50">
        {saveMutation.isPending ? t('saving') : t('saveSettings')}
      </button>
    </div>
  );
}
