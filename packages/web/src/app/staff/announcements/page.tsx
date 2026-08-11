'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Megaphone, Send, Clock, Sparkles, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ANNOUNCEMENT_TYPES = [
  { value: 'update', emoji: '🔵' },
  { value: 'feature', emoji: '🟢' },
  { value: 'maintenance', emoji: '🟡' },
  { value: 'hotfix', emoji: '🔴' },
] as const;

const TYPE_BORDER: Record<string, string> = {
  update: '#5865f2',
  feature: '#57f287',
  maintenance: '#fee75c',
  hotfix: '#ed4245',
};

const TYPE_BADGE: Record<string, string> = {
  update: 'bg-blue-500/20 text-blue-300',
  feature: 'bg-green-500/20 text-green-300',
  maintenance: 'bg-yellow-500/20 text-yellow-300',
  hotfix: 'bg-red-500/20 text-red-300',
};

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  authorId: string;
  guildCount: number;
  sentAt: string;
}

function formatRelative(dateStr: string, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('justNow');
  if (mins < 60) return t('minsAgo', { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('hrsAgo', { hrs });
  return t('daysAgo', { days: Math.floor(hrs / 24) });
}

export default function AnnouncementsPage() {
  const t = useTranslations('staffAnnouncements');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<string>('update');
  const [generating, setGenerating] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => adminApi.getAnnouncements(),
  });

  const announcements = (res?.data?.data ?? []) as Announcement[];

  const mutation = useMutation({
    mutationFn: () => adminApi.sendAnnouncement({ title: title.trim(), body: body.trim(), type }),
    onSuccess: (res) => {
      const count = (res.data as any)?.data?.guildCount ?? 0;
      toast.success(t('sentToast', { count }));
      setTitle('');
      setBody('');
      setType('update');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: () => toast.error(t('sendError')),
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await adminApi.generateAnnouncement(20);
      const draft = res.data?.data;
      if (draft) {
        setTitle(draft.title);
        setBody(draft.body);
        setType(draft.type ?? 'update');
        toast.success(t('draftGenerated'));
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('draftError');
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !mutation.isPending;

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Megaphone className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{t('compose')}</h2>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-secondary flex items-center gap-2 text-sm py-1.5"
              title={t('draftTooltip')}
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-yellow-400" />
              )}
              {generating ? t('drafting') : t('draftFromCommits')}
            </button>
          </div>

          {/* Type picker */}
          <div>
            <label className="label">{t('typeLabel')}</label>
            <div className="grid grid-cols-2 gap-2">
              {ANNOUNCEMENT_TYPES.map((at) => (
                <button
                  key={at.value}
                  onClick={() => setType(at.value)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                    type === at.value
                      ? 'border-discord-blurple bg-discord-blurple/20 text-white'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span className="block font-medium">{at.emoji} {t(`typeName_${at.value}`)}</span>
                  <span className="block text-xs opacity-75">{t(`typeDesc_${at.value}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="label">{t('titleLabel')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder={t('titlePlaceholder')}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/100</p>
          </div>

          {/* Body */}
          <div>
            <label className="label">{t('messageLabel')}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input w-full min-h-[140px] resize-y"
              placeholder={t('messagePlaceholder')}
              maxLength={2000}
            />
            <p className="text-xs text-gray-500 mt-1">{body.length}/2000</p>
          </div>

          {/* Preview */}
          {(title || body) && (
            <div
              className="bg-gray-800/60 rounded-lg p-4 border-l-4 space-y-1"
              style={{ borderColor: TYPE_BORDER[type] ?? TYPE_BORDER.update }}
            >
              <p className="text-white font-semibold text-sm">{title || t('untitled')}</p>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{body || '…'}</p>
              <p className="text-gray-500 text-xs">{t('previewFooter', { type: t(`typeName_${type}`) })}</p>
            </div>
          )}

          <button
            onClick={() => mutation.mutate()}
            disabled={!canSend}
            className="btn-primary flex items-center gap-2 w-full justify-center"
          >
            <Send className="w-4 h-4" />
            {mutation.isPending ? t('sending') : t('sendAnnouncement')}
          </button>
        </div>

        {/* History */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">{t('history')}</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card h-24 animate-pulse bg-gray-700" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="card p-6 text-center text-gray-400">{t('noneSent')}</div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {announcements.map((a) => (
                <div key={a.id} className="card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-white font-medium text-sm">{a.title}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${TYPE_BADGE[a.type] ?? TYPE_BADGE.update}`}>
                      {a.type}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm line-clamp-2 whitespace-pre-wrap">{a.body}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelative(a.sentAt, t)}
                    </span>
                    <span>{t('serverCount', { count: a.guildCount })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
