'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Image from 'next/image';
import { ShieldAlert, Send } from 'lucide-react';
import { LandingNav } from '@/components/LandingNav';
import { appealsApi, authApi, getLoginUrl } from '@/lib/api';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';

const CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';
const SITE = {
  docsUrl: 'https://docs.arkenbot.app/',
  supportUrl: 'https://discord.gg/fXJnYPdHRX',
  inviteUrl: `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands`,
};

type Appealable = { guildId: string; guildName: string; guildIcon: string | null; type: string; reason: string; hasPending: boolean };

export default function AppealPage() {
  const t = useTranslations('appealPublic');
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: meRes, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().then((r) => r.data).catch(() => null),
    retry: false,
  });
  const authed = !!(meRes as { data?: unknown } | null)?.data;

  const { data: listRes, isLoading: listLoading } = useQuery({
    queryKey: ['appealable'],
    queryFn: () => appealsApi.appealable(),
    enabled: authed,
  });
  const servers: Appealable[] = (listRes?.data as { data?: Appealable[] })?.data ?? [];

  const submit = useMutation({
    mutationFn: ({ guildId, reason }: { guildId: string; reason: string }) => appealsApi.submit(guildId, reason),
    onSuccess: () => {
      toast.success(t('submitted'));
      queryClient.invalidateQueries({ queryKey: ['appealable'] });
    },
    onError: () => toast.error(t('error')),
  });

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <LandingNav docsUrl={SITE.docsUrl} supportUrl={SITE.supportUrl} inviteUrl={SITE.inviteUrl} />
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-7 h-7 text-discord-blurple" />
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        </div>
        <p className="text-[var(--text-muted)] mb-8">{t('subtitle')}</p>

        {meLoading ? (
          <div className="card h-40 animate-pulse bg-gray-700" />
        ) : !authed ? (
          <div className="card text-center py-10">
            <p className="text-gray-300 mb-4">{t('loginPrompt')}</p>
            <a href={getLoginUrl('/appeal')} className="btn-primary inline-flex">{t('login')}</a>
          </div>
        ) : listLoading ? (
          <div className="card h-40 animate-pulse bg-gray-700" />
        ) : servers.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">{t('nothing')}</div>
        ) : (
          <div className="space-y-4">
            {servers.map((s) => (
              <div key={s.guildId} className="card">
                <div className="flex items-center gap-3 mb-3">
                  {s.guildIcon
                    ? <Image src={s.guildIcon} alt="" width={40} height={40} className="rounded-full" unoptimized />
                    : <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-sm text-gray-400">{s.guildName.slice(0, 2)}</div>}
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">{s.guildName}</div>
                    <div className="text-xs text-gray-500">{t(`type.${s.type}`)}</div>
                  </div>
                </div>
                {s.hasPending ? (
                  <p className="text-sm text-yellow-400">{t('pending')}</p>
                ) : (
                  <>
                    <textarea
                      className="input w-full min-h-[100px]"
                      placeholder={t('reasonPlaceholder')}
                      maxLength={1000}
                      value={drafts[s.guildId] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.guildId]: e.target.value }))}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        className="btn-primary flex items-center gap-2"
                        disabled={submit.isPending || (drafts[s.guildId]?.trim().length ?? 0) < 5}
                        onClick={() => submit.mutate({ guildId: s.guildId, reason: drafts[s.guildId]?.trim() ?? '' })}
                      >
                        <Send className="w-4 h-4" /> {t('submit')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
