'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { settingsApi, guildsApi, configTransferApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Check, ChevronRight, ChevronLeft, Sparkles, MessageSquare, Shield, Bot, TrendingUp, PartyPopper, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface GuildChannel { id: string; name: string; type: number }
interface GuildRole { id: string; name: string }

const STEPS = [
  { id: 'welcome-msg', icon: MessageSquare },
  { id: 'moderation',  icon: Shield },
  { id: 'automod',     icon: Bot },
  { id: 'leveling',    icon: TrendingUp },
  { id: 'done',        icon: PartyPopper },
];

export default function SetupWizardPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('setupWizardPage');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const { data: settingsRes } = useQuery({
    queryKey: ['settings', guildId],
    queryFn: () => settingsApi.get(guildId),
  });
  const { data: welcomeRes } = useQuery({
    queryKey: ['welcome', guildId],
    queryFn: () => settingsApi.getWelcome(guildId),
  });
  const { data: automodRes } = useQuery({
    queryKey: ['automod', guildId],
    queryFn: () => settingsApi.getAutoMod(guildId),
  });
  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });
  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const settings   = settingsRes?.data?.data as Record<string, unknown> | undefined;
  const welcome    = welcomeRes?.data?.data as Record<string, unknown> | undefined;
  const automod    = automodRes?.data?.data as Record<string, unknown> | undefined;
  const channels   = ((channelsRes?.data?.data ?? []) as GuildChannel[]).filter((c) => c.type === 0);
  const roles      = (rolesRes?.data?.data ?? []) as GuildRole[];

  const advance = () => {
    setCompleted((prev) => new Set([...prev, step]));
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };

  const isLast = step === STEPS.length - 1;

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-icon"><Sparkles className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Restore from a backup instead of configuring from scratch */}
      {step === 0 && (
        <div className="mb-6 rounded-xl border border-discord-blurple/25 bg-discord-blurple/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{t('haveBackup')}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('haveBackupDesc')}
            </p>
          </div>
          <label className="btn-secondary flex items-center gap-2 cursor-pointer whitespace-nowrap">
            <Upload className="w-4 h-4" /> {t('restoreBackup')}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const parsed = JSON.parse(await file.text());
                  const res = await configTransferApi.import(guildId, parsed);
                  const counts = (res.data as { data?: { imported?: Record<string, number> } })?.data?.imported ?? {};
                  toast.success(t('backupRestored', { sections: Object.keys(counts).length }));
                  router.push(`/dashboard/${guildId}`);
                } catch (err) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  toast.error((err as any)?.response?.data?.error ?? t('importFailed'));
                }
              }}
            />
          </label>
        </div>
      )}

      {/* Step progress */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = completed.has(i);
          const active = i === step;
          return (
            <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => i <= step || done ? setStep(i) : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-discord-blurple text-white'
                    : done
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-[var(--bg-card)] text-gray-500'
                }`}
              >
                {done && !active ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                {t(`step_${s.id}`)}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Step panels */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6">
        {step === 0 && (
          <WelcomeStep
            guildId={guildId}
            welcome={welcome}
            channels={channels}
            onNext={advance}
          />
        )}
        {step === 1 && (
          <ModerationStep
            guildId={guildId}
            settings={settings}
            channels={channels}
            roles={roles}
            onNext={advance}
          />
        )}
        {step === 2 && (
          <AutoModStep
            guildId={guildId}
            automod={automod}
            onNext={advance}
          />
        )}
        {step === 3 && (
          <LevelingStep
            guildId={guildId}
            settings={settings}
            onNext={advance}
          />
        )}
        {step === 4 && (
          <DoneStep guildId={guildId} completed={completed} />
        )}
      </div>

      {/* Nav buttons */}
      {!isLast && (
        <div className="flex justify-between mt-4">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> {t('back')}
          </button>
          <button onClick={advance} className="btn-primary flex items-center gap-2 text-sm">
            {step === STEPS.length - 2 ? t('finish') : t('next')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step: Welcome Messages ───────────────────────────────────────────────────

function WelcomeStep({
  guildId,
  welcome,
  channels,
  onNext,
}: {
  guildId: string;
  welcome: Record<string, unknown> | undefined;
  channels: GuildChannel[];
  onNext: () => void;
}) {
  const t = useTranslations('setupWizardPage');
  const [enabled, setEnabled] = useState<boolean>((welcome?.welcomeEnabled as boolean | undefined) ?? false);
  const [channelId, setChannelId] = useState<string>((welcome?.welcomeChannelId as string | undefined) ?? '');
  const [message, setMessage] = useState<string>((welcome?.welcomeMessage as string | undefined) ?? t('welcomeDefault'));

  const mut = useMutation({
    mutationFn: (data: object) => settingsApi.updateWelcome(guildId, data),
    onSuccess: () => { toast.success(t('welcomeSaved')); onNext(); },
    onError: () => toast.error(t('welcomeSaveError')),
  });

  const save = () => mut.mutate({ welcomeEnabled: enabled, welcomeChannelId: channelId, welcomeMessage: message });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg mb-1">{t('welcomeTitle')}</h2>
        <p className="text-gray-500 text-sm">{t('welcomeDesc')}</p>
      </div>

      <Toggle label={t('enableWelcome')} enabled={enabled} onChange={setEnabled} />

      {enabled && (
        <>
          <div>
            <label className="label">{t('welcomeChannel')}</label>
            <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">{t('selectChannel')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('messageLabel')}</label>
            <p className="text-xs text-gray-500 mb-1">{t.rich('variablesHint', { code: (c) => <code className="text-gray-400">{c}</code> })}</p>
            <textarea
              className="input min-h-[72px] resize-y"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </>
      )}

      <button onClick={save} disabled={mut.isPending} className="btn-primary w-full">
        {mut.isPending ? t('saving') : t('saveContinue')}
      </button>
    </div>
  );
}

// ─── Step: Moderation ─────────────────────────────────────────────────────────

function ModerationStep({
  guildId,
  settings,
  channels,
  roles,
  onNext,
}: {
  guildId: string;
  settings: Record<string, unknown> | undefined;
  channels: GuildChannel[];
  roles: GuildRole[];
  onNext: () => void;
}) {
  const t = useTranslations('setupWizardPage');
  const [enabled, setEnabled]     = useState<boolean>((settings?.moderationEnabled as boolean | undefined) ?? false);
  const [logChannel, setLogChannel] = useState<string>((settings?.logChannelId as string | undefined) ?? '');
  const [modRole, setModRole]     = useState<string>((settings?.modRoleId as string | undefined) ?? '');

  const mut = useMutation({
    mutationFn: (data: object) => settingsApi.update(guildId, data),
    onSuccess: () => { toast.success(t('moderationSaved')); onNext(); },
    onError: () => toast.error(t('moderationSaveError')),
  });

  const save = () => mut.mutate({ moderationEnabled: enabled, logChannelId: logChannel || undefined, modRoleId: modRole || undefined });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg mb-1">{t('moderationTitle')}</h2>
        <p className="text-gray-500 text-sm">{t('moderationDesc')}</p>
      </div>

      <Toggle label={t('enableModeration')} enabled={enabled} onChange={setEnabled} />

      {enabled && (
        <>
          <div>
            <label className="label">{t('modLogChannel')} <span className="text-gray-500">{t('optional')}</span></label>
            <select className="input" value={logChannel} onChange={(e) => setLogChannel(e.target.value)}>
              <option value="">{t('none')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('moderatorRole')} <span className="text-gray-500">{t('optional')}</span></label>
            <select className="input" value={modRole} onChange={(e) => setModRole(e.target.value)}>
              <option value="">{t('none')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <button onClick={save} disabled={mut.isPending} className="btn-primary w-full">
        {mut.isPending ? t('saving') : t('saveContinue')}
      </button>
    </div>
  );
}

// ─── Step: Auto-Mod ───────────────────────────────────────────────────────────

function AutoModStep({
  guildId,
  automod,
  onNext,
}: {
  guildId: string;
  automod: Record<string, unknown> | undefined;
  onNext: () => void;
}) {
  const t = useTranslations('setupWizardPage');
  const [spam, setSpam]       = useState<boolean>((automod?.antiSpamEnabled as boolean | undefined) ?? false);
  const [filter, setFilter]   = useState<boolean>((automod?.filterEnabled as boolean | undefined) ?? false);
  const [mention, setMention] = useState<boolean>((automod?.antiMentionEnabled as boolean | undefined) ?? false);
  const [raid, setRaid]       = useState<boolean>((automod?.antiRaidEnabled as boolean | undefined) ?? false);

  const mut = useMutation({
    mutationFn: (data: object) => settingsApi.updateAutoMod(guildId, data),
    onSuccess: () => { toast.success(t('automodSaved')); onNext(); },
    onError: () => toast.error(t('automodSaveError')),
  });

  const save = () => mut.mutate({ antiSpamEnabled: spam, filterEnabled: filter, antiMentionEnabled: mention, antiRaidEnabled: raid });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg mb-1">{t('automodTitle')}</h2>
        <p className="text-gray-500 text-sm">{t('automodDesc')}</p>
      </div>

      <div className="space-y-3">
        <Toggle label={t('antiSpam')} enabled={spam} onChange={setSpam} />
        <Toggle label={t('wordFilter')} enabled={filter} onChange={setFilter} />
        <Toggle label={t('antiMention')} enabled={mention} onChange={setMention} />
        <Toggle label={t('antiRaid')} enabled={raid} onChange={setRaid} />
      </div>

      <button onClick={save} disabled={mut.isPending} className="btn-primary w-full">
        {mut.isPending ? t('saving') : t('saveContinue')}
      </button>
    </div>
  );
}

// ─── Step: Leveling ───────────────────────────────────────────────────────────

function LevelingStep({
  guildId,
  settings,
  onNext,
}: {
  guildId: string;
  settings: Record<string, unknown> | undefined;
  onNext: () => void;
}) {
  const t = useTranslations('setupWizardPage');
  const [enabled, setEnabled] = useState<boolean>((settings?.levelingEnabled as boolean | undefined) ?? false);

  const mut = useMutation({
    mutationFn: (data: object) => settingsApi.update(guildId, data),
    onSuccess: () => { toast.success(t('levelingSaved')); onNext(); },
    onError: () => toast.error(t('levelingSaveError')),
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg mb-1">{t('levelingTitle')}</h2>
        <p className="text-gray-500 text-sm">{t('levelingDesc')}</p>
      </div>

      <Toggle label={t('enableLeveling')} enabled={enabled} onChange={setEnabled} />

      <button
        onClick={() => mut.mutate({ levelingEnabled: enabled })}
        disabled={mut.isPending}
        className="btn-primary w-full"
      >
        {mut.isPending ? t('saving') : t('saveContinue')}
      </button>
    </div>
  );
}

// ─── Step: Done ───────────────────────────────────────────────────────────────

function DoneStep({ guildId, completed }: { guildId: string; completed: Set<number> }) {
  const t = useTranslations('setupWizardPage');
  const router = useRouter();

  const quickLinks = [
    { href: `/dashboard/${guildId}/automod`,    label: t('quick_automod') },
    { href: `/dashboard/${guildId}/leveling`,   label: t('quick_leveling') },
    { href: `/dashboard/${guildId}/moderation`, label: t('quick_moderation') },
    { href: `/dashboard/${guildId}/logging`,    label: t('quick_logging') },
  ];

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check className="w-7 h-7 text-green-400" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-xl">{t('allSet')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {t('stepsConfigured', { done: completed.size, total: STEPS.length - 1 })}
          </p>
        </div>
      </div>

      <div className="text-left space-y-2">
        {quickLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-[var(--bg-base)] border border-white/[0.04] hover:border-discord-blurple/40 transition-colors group"
          >
            <span className="text-gray-300 text-sm group-hover:text-white transition-colors">{l.label}</span>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-discord-blurple transition-colors" />
          </Link>
        ))}
      </div>

      <button
        onClick={() => router.push(`/dashboard/${guildId}`)}
        className="btn-primary w-full"
      >
        {t('goToOverview')}
      </button>
    </div>
  );
}
