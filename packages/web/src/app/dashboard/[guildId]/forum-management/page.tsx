'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type ForumChannelConfig = {
  templateMessage: string | null;
  autoTagId: string | null;
};

type ForumManagementConfig = {
  channels: Record<string, ForumChannelConfig>;
};

const forumManagementApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/forum-management/config`),
  update: (guildId: string, data: Partial<ForumManagementConfig>) =>
    api.patch(`/guilds/${guildId}/forum-management/config`, data),
};

const DEFAULT_CHANNEL_CONFIG: ForumChannelConfig = {
  templateMessage: null,
  autoTagId: null,
};

export default function ForumManagementPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('forumManagementPage');
  const queryClient = useQueryClient();

  const [channelConfigs, setChannelConfigs] = useState<Record<string, ForumChannelConfig>>({});
  const [newChannelId, setNewChannelId] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['forum-management-config', guildId],
    queryFn: () => forumManagementApi.get(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  useEffect(() => {
    const cfg = (configRes?.data as { data?: ForumManagementConfig })?.data;
    if (cfg?.channels) setChannelConfigs(cfg.channels);
  }, [configRes]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<ForumManagementConfig>) => forumManagementApi.update(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['forum-management-config', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  // type 15 = forum channel in Discord
  const forumChannels = allChannels.filter((c) => c.type === 15);
  const configuredChannelIds = Object.keys(channelConfigs);
  const availableForumChannels = forumChannels.filter((c) => !configuredChannelIds.includes(c.id));

  const handleSaveChannel = (channelId: string) => {
    const updated = { ...channelConfigs };
    saveMutation.mutate({ channels: updated });
  };

  const handleRemoveChannel = (channelId: string) => {
    const updated = { ...channelConfigs };
    delete updated[channelId];
    setChannelConfigs(updated);
    saveMutation.mutate({ channels: updated });
  };

  const handleAddChannel = () => {
    if (!newChannelId) {
      toast.error(t('selectForumError'));
      return;
    }
    if (channelConfigs[newChannelId]) {
      toast.error(t('alreadyConfigured'));
      return;
    }
    const updated = {
      ...channelConfigs,
      [newChannelId]: {
        templateMessage: newTemplate.trim() || null,
        autoTagId: null,
      },
    };
    setChannelConfigs(updated);
    saveMutation.mutate({ channels: updated });
    setNewChannelId('');
    setNewTemplate('');
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card h-28 animate-pulse bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><MessagesSquare className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Add forum channel */}
      <div className="card mb-6">
        <h3 className="text-base font-semibold text-white mb-4">{t('addTitle')}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">{t('forumChannel')}</label>
            <select className="input" value={newChannelId} onChange={(e) => setNewChannelId(e.target.value)}>
              <option value="">{t('selectForum')}</option>
              {availableForumChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
              {forumChannels.length === 0 && (
                <option value="" disabled>{t('noForumChannels')}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">{t('initialTemplate')}</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder={t('templatePlaceholder')}
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
            />
          </div>
          <button
            onClick={handleAddChannel}
            disabled={saveMutation.isPending}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t('addChannel')}
          </button>
        </div>
      </div>

      {/* Configured channels */}
      {configuredChannelIds.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          <MessagesSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>{t('noConfigured')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {configuredChannelIds.map((channelId) => {
            const channelCfg = channelConfigs[channelId];
            const ch = allChannels.find((c) => c.id === channelId);
            return (
              <div key={channelId} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {ch ? `#${ch.name}` : channelId}
                    </p>
                    <p className="text-xs font-mono text-gray-500">{channelId}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveChannel(channelId)}
                    disabled={saveMutation.isPending}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    title={t('removeChannel')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="label">{t('templateMessage')}</label>
                    <textarea
                      className="input min-h-[80px] resize-none"
                      placeholder={t('templatePlaceholder')}
                      value={channelCfg.templateMessage ?? ''}
                      onChange={(e) =>
                        setChannelConfigs((prev) => ({
                          ...prev,
                          [channelId]: { ...prev[channelId], templateMessage: e.target.value || null },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">{t('autoTagId')}</label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('autoTagPlaceholder')}
                      value={channelCfg.autoTagId ?? ''}
                      onChange={(e) =>
                        setChannelConfigs((prev) => ({
                          ...prev,
                          [channelId]: { ...prev[channelId], autoTagId: e.target.value || null },
                        }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('autoTagHelp')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSaveChannel(channelId)}
                    disabled={saveMutation.isPending}
                    className="btn-primary text-sm"
                  >
                    {saveMutation.isPending ? t('saving') : t('save')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
