'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { permissionHealthApi } from '@/lib/api';
import { KeyRound, ShieldCheck, ShieldAlert, RefreshCw, ExternalLink, Hash } from 'lucide-react';
import { useTranslations } from 'next-intl';

const CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';
// Full permission set (matches the /invite command and the corrected site link).
const INVITE_URL = CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675953536247&integration_type=0&scope=bot+applications.commands`
  : 'https://discord.com';

type Health = {
  botInGuild: boolean;
  administrator: boolean;
  botHighestPosition?: number;
  missing: string[];
  channels: { id: string; name: string; missing: string[] }[];
};

export default function PermissionHealthPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const t = useTranslations('permissionHealth');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['permission-health', guildId],
    queryFn: () => permissionHealthApi.get(guildId),
  });
  const health = (data?.data as { data?: Health } | undefined)?.data;

  const clean = health && health.botInGuild && (health.administrator || (health.missing.length === 0 && health.channels.length === 0));

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><KeyRound className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary flex items-center gap-2 shrink-0">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
      </div>

      {isLoading ? (
        <div className="card space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-700 rounded animate-pulse" />)}
        </div>
      ) : isError ? (
        <div className="card text-center text-red-400 py-8">{t('loadError')}</div>
      ) : !health?.botInGuild ? (
        <div className="card text-center py-8 text-gray-400">{t('notInServer')}</div>
      ) : clean ? (
        <div className="card flex items-start gap-3 border border-emerald-500/30 bg-emerald-500/5">
          <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-white">{t('allGoodTitle')}</div>
            <div className="text-sm text-gray-400 mt-0.5">
              {health.administrator ? t('allGoodAdmin') : t('allGood')}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {health.missing.length > 0 && (
            <div className="card border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-white">{t('serverMissingTitle')}</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">{t('serverMissingDesc')}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {health.missing.map((p) => (
                  <span key={p} className="px-2.5 py-1 rounded-md text-sm bg-amber-500/10 text-amber-300 border border-amber-500/20">{p}</span>
                ))}
              </div>
              <a href={INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                {t('reInvite')}
              </a>
              <p className="text-xs text-gray-500 mt-2">{t('reInviteHint')}</p>
            </div>
          )}

          {health.channels.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-white">{t('channelIssuesTitle')}</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">{t('channelIssuesDesc')}</p>
              <div className="space-y-2">
                {health.channels.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 border-b border-gray-700/50 last:border-0">
                    <span className="font-medium text-white">#{c.name}</span>
                    <span className="text-gray-500">—</span>
                    {c.missing.map((m) => (
                      <span key={m} className="px-2 py-0.5 rounded text-xs bg-gray-700/60 text-gray-300">{m}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">{t('roleHint')}</p>
        </div>
      )}
    </div>
  );
}
