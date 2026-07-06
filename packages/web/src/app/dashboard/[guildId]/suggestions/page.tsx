'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, ThumbsUp, ThumbsDown } from 'lucide-react';
import { guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

type SuggestionsConfig = {
  enabled?: boolean;
  channelId?: string;
  allowVoting?: boolean;
};

type Suggestion = {
  id: string;
  content: string;
  userId: string;
  username: string | null;
  status: 'pending' | 'approved' | 'denied' | 'considering';
  upvotes: number;
  downvotes: number;
  staffNote?: string;
  createdAt: string;
};

const suggestionsApi = {
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/suggestions/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/suggestions/config`, data),
  list: (guildId: string, status?: string) =>
    api.get(`/guilds/${guildId}/suggestions`, { params: status && status !== 'all' ? { status } : {} }),
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'denied', label: 'Denied' },
  { key: 'considering', label: 'Considering' },
] as const;

type StatusTab = typeof STATUS_TABS[number]['key'];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  approved: 'bg-green-500/15 text-green-400',
  denied: 'bg-red-500/15 text-red-400',
  considering: 'bg-blue-500/15 text-blue-300',
};

export default function SuggestionsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<SuggestionsConfig>({});
  const [activeTab, setActiveTab] = useState<StatusTab>('all');

  const { data: configRes, isLoading: configLoading } = useQuery({
    queryKey: ['suggestions-config', guildId],
    queryFn: () => suggestionsApi.getConfig(guildId),
  });

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['suggestions', guildId, activeTab],
    queryFn: () => suggestionsApi.list(guildId, activeTab),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    if (configRes?.data) {
      const data = (configRes.data as { data?: SuggestionsConfig }).data;
      if (data) setConfig(data);
    }
  }, [configRes]);

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const suggestions: Suggestion[] = (suggestionsRes?.data as { data?: Suggestion[] })?.data ?? [];

  const configMutation = useMutation({
    mutationFn: (data: Partial<SuggestionsConfig>) => suggestionsApi.updateConfig(guildId, data),
    onSuccess: () => {
      toast.success('Suggestions settings saved!');
      queryClient.invalidateQueries({ queryKey: ['suggestions-config', guildId] });
    },
    onError: () => toast.error('Failed to save suggestions settings'),
  });

  const handleConfigChange = (partial: Partial<SuggestionsConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
    configMutation.mutate(partial);
  };

  if (configLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-4xl space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card h-40 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><MessageSquarePlus className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Suggestions</h1>
          <div className="page-head-desc">Let members submit ideas and vote on them.</div>
        </div>
      </div>

      <SettingsSection title="Configuration" description="Set up the suggestions system for this server.">
        <Toggle
          label="Enable Suggestions"
          description="Allow members to submit suggestions using the /suggest command"
          enabled={config.enabled ?? false}
          onChange={(v) => handleConfigChange({ enabled: v })}
        />
        <div>
          <label className="label">Announcement Channel</label>
          <select
            className="input"
            value={config.channelId ?? ''}
            onChange={(e) => handleConfigChange({ channelId: e.target.value || undefined })}
          >
            <option value="">Select a channel</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">New suggestions will be posted in this channel for members to see and vote on.</p>
        </div>
        <Toggle
          label="Allow Voting"
          description="Members can upvote or downvote suggestions with emoji reactions"
          enabled={config.allowVoting ?? true}
          onChange={(v) => handleConfigChange({ allowVoting: v })}
        />
      </SettingsSection>

      <div className="card">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white mb-3">Suggestions</h2>
          <div className="flex gap-1 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-discord-blurple text-white'
                    : 'bg-[var(--bg-base)] text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {suggestionsLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10">
            No suggestions found{activeTab !== 'all' ? ` with status "${activeTab}"` : ''}.
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.id} className="p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-100 leading-relaxed">{s.content}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      <span className="text-xs text-gray-500">Author: {s.username ?? s.userId}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] ?? 'bg-gray-700 text-gray-400'}`}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <ThumbsUp className="w-3 h-3" />
                        {s.upvotes}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <ThumbsDown className="w-3 h-3" />
                        {s.downvotes}
                      </span>
                    </div>
                    {s.staffNote && (
                      <div className="mt-2 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                        <p className="text-xs text-blue-300"><span className="font-semibold">Staff note:</span> {s.staffNote}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
