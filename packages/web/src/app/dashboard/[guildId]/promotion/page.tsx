'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { promotionApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect, type KeyboardEvent } from 'react';
import { Megaphone, Info, X, Plus, Trophy, Tag, MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Cfg { enabled?: boolean; trackStatus?: boolean; trackTag?: boolean; keywords?: string[] }
interface LeaderEntry {
  userId: string; username: string | null; avatar: string | null;
  statusSeconds: number; tagSeconds: number; totalSeconds: number;
  statusActive: boolean; tagActive: boolean; promoting: boolean;
  lastActivity: string | null; sessions: number;
}

function fmtDuration(totalSeconds: number, t: (k: string, v?: Record<string, number>) => string): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return t('dh', { d, h });
  if (h > 0) return t('hm', { h, m });
  if (m > 0) return t('mOnly', { m });
  return t('lessMin');
}

function avatarUrl(userId: string, avatar: string | null): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`;
  const idx = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

export default function PromotionDashPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('promotionPage');
  const qc = useQueryClient();

  const { data: cfgRes } = useQuery({ queryKey: ['promotion-config', guildId], queryFn: () => promotionApi.getConfig(guildId) });
  const { data: lbRes, isLoading: lbLoading } = useQuery({ queryKey: ['promotion-leaderboard', guildId], queryFn: () => promotionApi.leaderboard(guildId, 100) });

  const cfg = (cfgRes?.data as { data?: Cfg } | undefined)?.data;
  const leaderboard = ((lbRes?.data as { data?: LeaderEntry[] } | undefined)?.data ?? []);

  const [enabled, setEnabled] = useState(false);
  const [trackStatus, setTrackStatus] = useState(true);
  const [trackTag, setTrackTag] = useState(true);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!cfg) return;
    setEnabled(cfg.enabled ?? false);
    setTrackStatus(cfg.trackStatus ?? true);
    setTrackTag(cfg.trackTag ?? true);
    setKeywords(cfg.keywords ?? []);
  }, [cfg]);

  const save = useMutation({
    mutationFn: () => promotionApi.updateConfig(guildId, { enabled, trackStatus, trackTag, keywords }),
    onSuccess: () => { toast.success(t('saved')); qc.invalidateQueries({ queryKey: ['promotion-config', guildId] }); },
    onError: () => toast.error(t('saveError')),
  });

  const addKeyword = () => {
    const v = draft.trim();
    if (!v) return;
    if (keywords.some((k) => k.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    if (keywords.length >= 25) { toast.error(t('maxKeywords')); return; }
    setKeywords([...keywords, v]);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); }
  };

  return (
    <div className="p-3 sm:p-6 max-w-5xl">
      <div className="page-head">
        <div className="page-head-icon"><Megaphone className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Honest limitation note */}
      <div className="flex items-start gap-2.5 bg-(--bg-elevated) border border-(--border-subtle) rounded-xl p-3.5 mb-5 text-[13px] text-(--text-muted)">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-(--accent)" />
        <p>{t('limitationNote')}</p>
      </div>

      {/* Config */}
      <div className="bg-(--bg-card) border border-(--border-subtle) rounded-xl p-5 mb-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-white">{t('enableTitle')}</h2>
            <p className="text-[12.5px] text-(--text-muted) mt-0.5">{t('enableDesc')}</p>
          </div>
          <Toggle enabled={enabled} onChange={setEnabled} />
        </div>

        <div className={enabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
          <div className="flex items-center justify-between border-t border-(--border-subtle) pt-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-(--text-muted)" />
              <div>
                <div className="text-[13.5px] font-semibold text-gray-200">{t('trackStatusTitle')}</div>
                <div className="text-[12px] text-(--text-muted)">{t('trackStatusDesc')}</div>
              </div>
            </div>
            <Toggle enabled={trackStatus} onChange={setTrackStatus} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-(--text-muted)" />
              <div>
                <div className="text-[13.5px] font-semibold text-gray-200">{t('trackTagTitle')}</div>
                <div className="text-[12px] text-(--text-muted)">{t('trackTagDesc')}</div>
              </div>
            </div>
            <Toggle enabled={trackTag} onChange={setTrackTag} />
          </div>

          {/* Keywords */}
          <div className={trackStatus ? 'border-t border-(--border-subtle) pt-4' : 'border-t border-(--border-subtle) pt-4 opacity-50 pointer-events-none'}>
            <div className="text-[13.5px] font-semibold text-gray-200">{t('keywordsTitle')}</div>
            <div className="text-[12px] text-(--text-muted) mt-0.5 mb-2.5">{t('keywordsDesc')}</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 bg-(--bg-elevated) border border-(--border-subtle) rounded-md px-2 py-1 text-[12.5px] text-gray-200">
                  {k}
                  <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="text-(--text-muted) hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {keywords.length === 0 && <span className="text-[12.5px] text-(--text-muted) italic">{t('noKeywords')}</span>}
            </div>
            <div className="flex gap-2">
              <input
                className="input text-sm flex-1"
                placeholder={t('keywordsPlaceholder')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={100}
              />
              <button onClick={addKeyword} className="btn-secondary text-sm flex items-center gap-1.5 flex-shrink-0">
                <Plus className="w-3.5 h-3.5" /> {t('add')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-(--border-subtle) pt-4">
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary text-sm disabled:opacity-60">
            {save.isPending ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-(--bg-card) border border-(--border-subtle) rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-(--border-subtle)">
          <Trophy className="w-4 h-4 text-(--accent)" />
          <h2 className="text-[14px] font-bold text-white">{t('leaderboardTitle')}</h2>
        </div>

        {lbLoading ? (
          <div className="p-6 text-center text-(--text-muted) text-sm">{t('loading')}</div>
        ) : leaderboard.length === 0 ? (
          <div className="p-8 text-center text-(--text-muted) text-sm">{t('leaderboardEmpty')}</div>
        ) : (
          <div className="divide-y divide-(--border-subtle)">
            {leaderboard.map((e, i) => (
              <div key={e.userId} className="flex items-center gap-3 px-5 py-3">
                <span className="w-6 text-center text-[13px] font-bold text-(--text-muted)">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl(e.userId, e.avatar)} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-gray-200 truncate">{e.username ?? e.userId}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {e.statusActive && <span className="inline-flex items-center gap-1 text-[11px] text-(--success)"><MessageSquareText className="w-3 h-3" />{t('statusActive')}</span>}
                    {e.tagActive && <span className="inline-flex items-center gap-1 text-[11px] text-(--success)"><Tag className="w-3 h-3" />{t('tagActive')}</span>}
                    {!e.promoting && <span className="text-[11px] text-(--text-muted)">{t('notPromoting')}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[13.5px] font-bold text-white">{fmtDuration(e.totalSeconds, t)}</div>
                  <div className="text-[11px] text-(--text-muted)">{t('sessionsCount', { count: e.sessions })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
