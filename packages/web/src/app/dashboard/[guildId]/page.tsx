'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { guildsApi, activityApi } from '@/lib/api';
import { Shield, TrendingUp, MessageSquare, Bot, Music, Check, Zap, Sparkles, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useWebSocket } from '@/lib/socket';
import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations } from 'next-intl';

/** Mock-pattern stat tile: uppercase label, big tabular value, optional delta and sparkline. */
function StatTile({ label, value, delta, spark }: {
  label: string; value: number; delta?: number | null; spark?: number[];
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-4 pt-[15px] pb-3 relative overflow-hidden">
      <p className="text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)] font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white leading-tight tracking-tight tabular mt-[3px]">
        {value.toLocaleString()}
        {delta != null && delta !== 0 && (
          <span className={`text-[11.5px] font-semibold ml-2 ${delta > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </p>
      {spark && spark.length > 1 && (
        <svg className="absolute right-0 bottom-0 opacity-90" width="110" height="40" viewBox="0 0 110 40" preserveAspectRatio="none">
          {(() => {
            const max = Math.max(...spark, 1);
            const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 110},${36 - (v / max) * 30}`);
            return (
              <>
                <polyline points={`0,40 ${pts.join(' ')} 110,40`} fill="var(--accent)" opacity="0.12" />
                <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

export default function GuildOverviewPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('overviewPage');
  const { user } = useAuth();
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  useEffect(() => {
    setChecklistDismissed(localStorage.getItem(`checklist_dismissed_${guildId}`) === '1');
  }, [guildId]);
  const [liveEvents, setLiveEvents] = useState<{ id: number; label: string; type: 'mod' | 'member'; ts: number }[]>([]);
  const eventIdRef = useRef(0);

  // Auto-expire events older than 5 minutes
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      setLiveEvents((prev) => prev.filter((e) => e.ts > cutoff));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const { data: analyticsRes } = useQuery({
    queryKey: ['guild-analytics', guildId],
    queryFn: () => guildsApi.analytics(guildId),
    refetchInterval: 30000,
  });

  const { data: guildRes } = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => guildsApi.get(guildId),
  });

  const { data: activityRes } = useQuery({
    queryKey: ['activity', guildId],
    queryFn: () => activityApi.get(guildId, 14),
    refetchInterval: 60000,
  });

  const analytics = analyticsRes?.data?.data;
  const guild = guildRes?.data?.data as {
    name?: string;
    settings?: Record<string, unknown>;
    welcomeConfig?: Record<string, unknown>;
    automodConfig?: Record<string, unknown>;
    guildAddons?: Array<{ addon: { displayName: string } }>;
  } | undefined;

  const activityData = ((activityRes?.data as { data?: { date: string; count: number }[] })?.data ?? []).map((row) => ({
    date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Messages: row.count,
  }));

  const msgSeries = activityData.map((d) => d.Messages);
  const msgToday = msgSeries[msgSeries.length - 1] ?? 0;
  const msgYesterday = msgSeries[msgSeries.length - 2] ?? 0;
  const msgDelta = msgYesterday > 0 ? Math.round(((msgToday - msgYesterday) / msgYesterday) * 100) : null;

  useWebSocket('member:join', (event) => {
    if (event.guildId === guildId) {
      const id = ++eventIdRef.current;
      setLiveEvents((prev) => [{ id, label: t('eventJoined', { user: (event.data as { userTag: string }).userTag }), type: 'member', ts: Date.now() }, ...prev.slice(0, 19)]);
    }
  });

  useWebSocket('moderation:action', (event) => {
    if (event.guildId === guildId) {
      const d = event.data as { type: string; userTag: string };
      const id = ++eventIdRef.current;
      setLiveEvents((prev) => [{ id, label: t('eventMod', { type: d.type, user: d.userTag }), type: 'mod', ts: Date.now() }, ...prev.slice(0, 19)]);
    }
  });

  const amc = guild?.automodConfig;
  const autoModOn = !!(amc && (amc.antiSpamEnabled || amc.filterEnabled || amc.antiLinkEnabled || amc.antiMentionEnabled || amc.antiCapsEnabled || amc.antiRaidEnabled));

  const isNewGuild = guild && !guild.settings?.moderationEnabled && !guild.settings?.levelingEnabled && !guild.welcomeConfig?.welcomeEnabled && !autoModOn;

  const features = [
    { label: t('feature_moderation'), icon: Shield, enabled: !!guild?.settings?.moderationEnabled },
    { label: t('feature_automod'), icon: Bot, enabled: autoModOn },
    { label: t('feature_leveling'), icon: TrendingUp, enabled: !!guild?.settings?.levelingEnabled },
    { label: t('feature_welcome'), icon: MessageSquare, enabled: !!guild?.welcomeConfig?.welcomeEnabled },
    { label: t('feature_logging'), icon: Zap, enabled: !!guild?.settings?.loggingEnabled },
    { label: t('feature_music'), icon: Music, enabled: !!guild?.settings?.musicEnabled },
  ];

  const installedAddons = guild?.guildAddons ?? [];

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <div className="page-head">
        <div className="page-head-icon"><Sparkles className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{(() => { const h = new Date().getHours(); const period = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; return `${t(`greet_${period}`)}${user?.username ? t('greetName', { name: user.username }) : ''}`; })()}</h1>
          <div className="page-head-desc">{t('subtitle', { server: guild?.name ?? t('yourServer') })}</div>
        </div>
        <div className="page-head-actions">
          <Link href={`/dashboard/${guildId}/setup`} className="btn-secondary">✦ {t('setupWizard')}</Link>
        </div>
      </div>

      {(() => {
        const steps = [
          { label: t('step_moderation'), done: !!guild?.settings?.moderationEnabled, href: 'moderation' },
          { label: t('step_welcome'), done: !!guild?.welcomeConfig?.welcomeEnabled, href: 'welcome' },
          { label: t('step_automod'), done: autoModOn, href: 'automod' },
          { label: t('step_leveling'), done: !!guild?.settings?.levelingEnabled, href: 'leveling' },
        ];
        const doneCount = steps.filter((st) => st.done).length;
        const pct = Math.round((doneCount / steps.length) * 100);
        if (checklistDismissed || doneCount === steps.length || !guild) return null;
        return (
          <div className="card p-0 mb-6">
            <div className="flex items-center gap-5 px-5 py-4">
              <svg viewBox="0 0 36 36" className="w-[52px] h-[52px] flex-shrink-0">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--accent)" strokeWidth="4"
                  strokeDasharray={`${pct} 100`} strokeLinecap="round" transform="rotate(-90 18 18)"
                  pathLength={100} />
                <text x="18" y="21.5" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="800">{pct}%</text>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{t('finishSetup')}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2">
                  {steps.map((st) => (
                    <Link key={st.label} href={`/dashboard/${guildId}/${st.href}`} className="flex items-center gap-2 text-[12.5px] group">
                      <span className={`w-[18px] h-[18px] rounded-full grid place-items-center flex-shrink-0 border ${st.done ? 'bg-[var(--success)] border-[var(--success)]' : 'border-[var(--border-strong)]'}`}>
                        {st.done && <Check className="w-2.5 h-2.5 text-black/70" />}
                      </span>
                      <span className={st.done ? 'text-[var(--text-muted)] line-through' : 'text-gray-300 group-hover:text-white'}>{st.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <button
                onClick={() => { localStorage.setItem(`checklist_dismissed_${guildId}`, '1'); setChecklistDismissed(true); }}
                className="btn-ghost text-xs flex-shrink-0"
              >
                {t('dismiss')}
              </button>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatTile label={t('stat_messages24h')} value={msgToday} delta={msgDelta} spark={msgSeries} />
        <StatTile label={t('stat_newMembers')} value={analytics?.newMembers24h ?? 0} />
        <StatTile label={t('stat_modActions')} value={analytics?.moderationActions24h ?? 0} />
        <StatTile
          label={t('stat_logEvents')}
          value={analytics?.logEvents?.reduce((a: number, b: { _count: { type: number } }) => a + b._count.type, 0) ?? 0}
        />
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl mb-6">
        <div className="flex items-center px-5 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-[13.5px] font-bold text-white">{t('messageActivity')}</h2>
            <p className="text-[11.5px] text-[var(--text-muted)]">{t('last14days')}</p>
          </div>
          <span className="ml-auto badge bg-[var(--accent-glow)] text-[var(--accent)] ring-1 ring-[var(--accent)]/30">14d</span>
        </div>
        <div className="p-5 pt-4">
        {activityData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
            {t('noActivity')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={activityData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C8AFF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7C8AFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0d1016', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                cursor={{ stroke: '#7C8AFF', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="Messages" stroke="#7C8AFF" strokeWidth={2.2} fill="url(#msgGradient)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-0 overflow-hidden">
          <div className="flex items-center px-[18px] py-[13px] border-b border-[var(--border-subtle)]">
            <h2 className="text-[13.5px] font-bold text-white">{t('liveActivity')}</h2>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--success)] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              {t('live')}
            </span>
          </div>
          <div className="p-[18px] pt-3">
            {liveEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-[var(--text-muted)] text-[12.5px] gap-2">
                <Zap className="w-6 h-6 opacity-40" />
                <p>{t('waitingActivity')}</p>
              </div>
            ) : (
              <div>
                {liveEvents.map((event) => {
                  const age = Date.now() - event.ts;
                  const mins = Math.floor(age / 60000);
                  const timeLabel = mins === 0 ? t('justNow') : t('minutesAgo', { mins });
                  return (
                    <div key={event.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--border-subtle)] last:border-0 animate-fade-in">
                      <span className="w-[30px] h-[30px] rounded-[9px] bg-[var(--bg-elevated)] grid place-items-center flex-shrink-0">
                        {event.type === 'mod'
                          ? <Shield className="w-3.5 h-3.5 text-[var(--danger)]" />
                          : <UserPlus className="w-3.5 h-3.5 text-[var(--success)]" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-gray-200 truncate">{event.label}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{event.type === 'mod' ? t('typeModeration') : t('typeMemberJoin')}</p>
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] tabular flex-shrink-0">{timeLabel}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-[13.5px] font-bold text-white">{t('featureHealth')}</h2>
            <span className="text-[11.5px] text-[var(--text-muted)]">
              {t('featuresEnabled', { enabled: features.filter((f) => f.enabled).length, total: features.length })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-5">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 py-2 border-b border-[var(--border-subtle)] last:border-0 text-[13px]">
                <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${f.enabled ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'}`} />
                <span className="text-gray-300 flex-1 truncate">{f.label}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{f.enabled ? t('on') : t('off')}</span>
              </div>
            ))}
          </div>

          {installedAddons.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 mt-4 mb-2">{t('addons')}</p>
              <div className="grid grid-cols-2 gap-2">
                {installedAddons.map((ga) => (
                  <div key={ga.addon.displayName} className="flex items-center gap-2.5 py-2 border-b border-[var(--border-subtle)] last:border-0 text-[13px]">
                    <span className="w-[7px] h-[7px] rounded-full bg-[var(--accent)] flex-shrink-0" />
                    <span className="text-gray-300 flex-1 truncate">{ga.addon.displayName}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{t('on')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
