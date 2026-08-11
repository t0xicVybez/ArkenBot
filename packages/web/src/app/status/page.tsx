'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LandingNav } from '@/components/LandingNav';
import { Footer } from '@/components/Footer';

const CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.arkenbot.app';

const SITE = {
  inviteUrl: CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`
    : 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands',
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
};

type Status = {
  api: { online: boolean; uptimeSeconds: number };
  database: { online: boolean; latencyMs: number | null };
  cache: { online: boolean };
  bot: { online: boolean; guilds: number | null; wsPingMs: number | null; lastSeen: string | null };
  checkedAt: string;
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusRow({ name, online, detail }: { name: string; online: boolean | null; detail?: string }) {
  const t = useTranslations('statusPage');
  return (
    <div className="flex items-center justify-between py-4 border-b border-[var(--border-subtle)] last:border-0">
      <div className="flex items-center gap-3">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            online === null ? 'bg-gray-500' : online ? 'bg-green-400' : 'bg-red-500'
          } ${online ? 'shadow-[0_0_8px_rgba(74,222,128,0.6)]' : ''}`}
          aria-hidden
        />
        <span className="text-sm font-medium text-white">{name}</span>
      </div>
      <div className="flex items-center gap-4">
        {detail && <span className="text-xs text-[var(--text-muted)]">{detail}</span>}
        <span className={`text-xs font-semibold ${online === null ? 'text-gray-500' : online ? 'text-green-400' : 'text-red-400'}`}>
          {online === null ? t('checking') : online ? t('operational') : t('down')}
        </span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const t = useTranslations('statusPage');
  const [status, setStatus] = useState<Status | null>(null);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/public/status`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.data) {
          setStatus(json.data as Status);
          setApiReachable(true);
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
          setApiReachable(false);
        }
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const allUp = apiReachable === true && !!status && status.database.online && status.cache.online && status.bot.online;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">{t('title')}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('subtitle')}
          </p>
        </div>

        {/* Overall banner */}
        <div
          className={`rounded-lg border px-5 py-4 mb-8 text-sm font-semibold ${
            apiReachable === null
              ? 'border-[var(--border-subtle)] bg-white/[0.03] text-[var(--text-muted)]'
              : allUp
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
          }`}
        >
          {apiReachable === null
            ? t('bannerChecking')
            : allUp
              ? t('bannerAllUp')
              : apiReachable === false
                ? t('bannerApiDown')
                : t('bannerPartial')}
        </div>

        <div className="card border border-[var(--border-subtle)] rounded-lg px-5">
          <StatusRow
            name={t('serviceBot')}
            online={apiReachable === null ? null : (status?.bot.online ?? false)}
            detail={
              status?.bot.online
                ? `${status.bot.guilds ?? '—'} ${t('serversWord')}${status.bot.wsPingMs != null ? ` · ${status.bot.wsPingMs}ms ${t('gatewayWord')}` : ''}`
                : status?.bot.lastSeen
                  ? t('lastSeen', { time: new Date(status.bot.lastSeen).toLocaleTimeString() })
                  : undefined
            }
          />
          <StatusRow
            name={t('serviceApi')}
            online={apiReachable === null ? null : apiReachable && !!status}
            detail={status ? t('upFor', { uptime: formatUptime(status.api.uptimeSeconds) }) : undefined}
          />
          <StatusRow
            name={t('serviceWeb')}
            online={true}
            detail={t('lookingAtIt')}
          />
          <StatusRow
            name={t('serviceDatabase')}
            online={apiReachable === null ? null : (status?.database.online ?? false)}
            detail={status?.database.latencyMs != null ? `${status.database.latencyMs}ms` : undefined}
          />
          <StatusRow
            name={t('serviceCache')}
            online={apiReachable === null ? null : (status?.cache.online ?? false)}
          />
        </div>

        {status && (
          <p className="text-xs text-[var(--text-muted)] mt-4">
            {t('lastChecked', { time: new Date(status.checkedAt).toLocaleTimeString() })}
          </p>
        )}

        <p className="text-sm text-[var(--text-secondary)] mt-8">
          {t('reportIssue')}{' '}
          <a href={SITE.supportUrl} target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">
            {t('supportServerLink')}
          </a>.
        </p>
      </main>

      <Footer maxWidthClass="max-w-2xl" />
    </div>
  );
}
