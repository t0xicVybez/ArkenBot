'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Report = {
  id: string;
  reporterTag: string;
  targetTag: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  staffNote?: string;
  createdAt: string;
};

type ReportConfig = {
  reportChannelId?: string | null;
};

const reportsApi = {
  list: (guildId: string, status?: string) =>
    api.get(`/guilds/${guildId}/reports`, { params: status ? { status } : {} }),
  update: (guildId: string, reportId: string, data: object) =>
    api.patch(`/guilds/${guildId}/reports/${reportId}`, data),
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/report-config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/report-config`, data),
};

type Tab = 'pending' | 'reviewed';

export default function ReportsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('reportsPage');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [staffNotes, setStaffNotes] = useState<Record<string, string>>({});
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [reportChannelId, setReportChannelId] = useState('');

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const { data: configRes } = useQuery({
    queryKey: ['report-config', guildId],
    queryFn: () => reportsApi.getConfig(guildId),
  });

  const { data: pendingRes, isLoading: pendingLoading } = useQuery({
    queryKey: ['reports', guildId, 'pending'],
    queryFn: () => reportsApi.list(guildId, 'pending'),
    refetchInterval: 30000,
  });

  const { data: reviewedRes, isLoading: reviewedLoading } = useQuery({
    queryKey: ['reports', guildId, 'reviewed'],
    queryFn: () => reportsApi.list(guildId),
    enabled: tab === 'reviewed',
  });

  useEffect(() => {
    const cfg = (configRes?.data as { data?: ReportConfig })?.data;
    if (cfg?.reportChannelId) setReportChannelId(cfg.reportChannelId);
  }, [configRes]);

  const saveConfigMutation = useMutation({
    mutationFn: (data: object) => reportsApi.updateConfig(guildId, data),
    onSuccess: () => {
      toast.success(t('configSaved'));
      queryClient.invalidateQueries({ queryKey: ['report-config', guildId] });
    },
    onError: () => toast.error(t('configError')),
  });

  const updateReportMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => reportsApi.update(guildId, id, data),
    onSuccess: () => {
      toast.success(t('reportUpdated'));
      setExpandedNote(null);
      queryClient.invalidateQueries({ queryKey: ['reports', guildId] });
    },
    onError: () => toast.error(t('updateError')),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);

  const pendingReports: Report[] = (pendingRes?.data as { data?: Report[] })?.data ?? [];
  const allReports: Report[] = (reviewedRes?.data as { data?: Report[] })?.data ?? [];
  const reviewedReports = allReports.filter((r) => r.status !== 'pending');

  const statusColors: Record<string, string> = {
    pending: 'badge-warning',
    reviewed: 'badge-success',
    dismissed: 'badge-info',
  };

  const isLoading = tab === 'pending' ? pendingLoading : reviewedLoading;
  const reports = tab === 'pending' ? pendingReports : reviewedReports;

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Flag className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Config */}
      <div className="card mb-6">
        <h3 className="text-base font-semibold text-white mb-3">{t('reportChannel')}</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <select
              className="input"
              value={reportChannelId}
              onChange={(e) => setReportChannelId(e.target.value)}
            >
              <option value="">{t('none')}</option>
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('reportChannelHelp')}</p>
          </div>
          <button
            onClick={() => saveConfigMutation.mutate({ reportChannelId: reportChannelId || null })}
            disabled={saveConfigMutation.isPending}
            className="btn-primary"
          >
            {saveConfigMutation.isPending ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'pending'
              ? 'border-discord-blurple text-discord-blurple'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          {t('pendingTab')}
          {pendingReports.length > 0 && (
            <span className="ml-2 text-xs text-red-400">({pendingReports.length})</span>
          )}
        </button>
        <button
          onClick={() => setTab('reviewed')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'reviewed'
              ? 'border-discord-blurple text-discord-blurple'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          {t('reviewedTab')}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-gray-700" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="card text-center py-10">
          <Flag className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-500" />
          <p className="text-gray-500 text-sm">
            {tab === 'pending' ? t('noPending') : t('noReviewed')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-white">{report.targetTag}</span>
                    <span className="text-xs text-gray-500">{t('reportedBy')}</span>
                    <span className="text-sm text-gray-300">{report.reporterTag}</span>
                    <span className={`badge ${statusColors[report.status] ?? 'badge-info'}`}>
                      {t(`status_${report.status}`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mb-1">{report.reason}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(report.createdAt).toLocaleString()}
                  </p>
                  {report.staffNote && (
                    <p className="text-xs text-gray-400 mt-1 border-t border-[var(--border-subtle)] pt-1">
                      {t('staffNotePrefix')} {report.staffNote}
                    </p>
                  )}
                </div>
                {report.status === 'pending' && (
                  <button
                    onClick={() => setExpandedNote(expandedNote === report.id ? null : report.id)}
                    className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-gray-600 hover:border-gray-400 flex-shrink-0"
                  >
                    {expandedNote === report.id ? t('cancel') : t('markReviewed')}
                  </button>
                )}
              </div>

              {expandedNote === report.id && (
                <div className="mt-3 border-t border-[var(--border-subtle)] pt-3 space-y-2">
                  <textarea
                    className="input min-h-[60px] resize-none"
                    placeholder={t('staffNotePlaceholder')}
                    value={staffNotes[report.id] ?? ''}
                    onChange={(e) => setStaffNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateReportMutation.mutate({
                          id: report.id,
                          data: { status: 'reviewed', staffNote: staffNotes[report.id] || undefined },
                        })
                      }
                      disabled={updateReportMutation.isPending}
                      className="btn-primary text-sm py-1.5"
                    >
                      {updateReportMutation.isPending ? t('saving') : t('markReviewed')}
                    </button>
                    <button
                      onClick={() =>
                        updateReportMutation.mutate({
                          id: report.id,
                          data: { status: 'dismissed', staffNote: staffNotes[report.id] || undefined },
                        })
                      }
                      disabled={updateReportMutation.isPending}
                      className="btn-secondary text-sm py-1.5"
                    >
                      {t('dismiss')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
