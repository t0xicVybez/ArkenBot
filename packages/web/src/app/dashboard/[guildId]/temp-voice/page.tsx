'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tempVoiceApi, guildsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Mic, Plus, Trash2 } from 'lucide-react';
import { SettingsSection } from '@/components/SettingsSection';
import { useTranslations } from 'next-intl';

interface Trigger {
  channelId: string;
  categoryId: string | null;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

export default function TempVoicePage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('tempVoice');
  const queryClient = useQueryClient();

  const [newChannelId, setNewChannelId] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');

  const { data: triggersRes } = useQuery({
    queryKey: ['temp-voice-triggers', guildId],
    queryFn: () => tempVoiceApi.getTriggers(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const triggers: Trigger[] =
    (triggersRes?.data as { data?: Trigger[] })?.data ?? [];
  const allChannels: Channel[] =
    (channelsRes?.data as { data?: Channel[] })?.data ?? [];

  const voiceChannels = allChannels.filter((c) => c.type === 2);
  const categories = allChannels.filter((c) => c.type === 4);

  const usedChannelIds = new Set(triggers.map((t) => t.channelId));

  const addMutation = useMutation({
    mutationFn: () =>
      tempVoiceApi.addTrigger(guildId, newChannelId, newCategoryId || null),
    onSuccess: () => {
      toast.success(t('added'));
      setNewChannelId('');
      setNewCategoryId('');
      queryClient.invalidateQueries({ queryKey: ['temp-voice-triggers', guildId] });
    },
    onError: () => toast.error(t('addError')),
  });

  const removeMutation = useMutation({
    mutationFn: (channelId: string) => tempVoiceApi.removeTrigger(guildId, channelId),
    onSuccess: () => {
      toast.success(t('removed'));
      queryClient.invalidateQueries({ queryKey: ['temp-voice-triggers', guildId] });
    },
    onError: () => toast.error(t('removeError')),
  });

  const channelName = (id: string) =>
    allChannels.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <div className="page-head">
        <div className="page-head-icon"><Mic className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('description')}</div>
        </div>
      </div>

      <SettingsSection
        title={t('triggersTitle')}
        description={t('triggersDesc')}
      >
        <div className="space-y-4">
          {triggers.length === 0 ? (
            <p className="text-sm text-gray-500">{t('empty')}</p>
          ) : (
            <ul className="space-y-2">
              {triggers.map((trig) => (
                <li
                  key={trig.channelId}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-white truncate">
                      🔊 {channelName(trig.channelId)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {trig.categoryId
                        ? t('createsIn', { category: channelName(trig.categoryId) })
                        : t('createsInSame')}
                    </span>
                  </div>
                  <button
                    onClick={() => removeMutation.mutate(trig.channelId)}
                    disabled={removeMutation.isPending}
                    className="ml-3 p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    aria-label={t('removeTrigger')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {t('addTriggerHeading')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">{t('triggerChannelLabel')}</label>
                <select
                  className="input"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                >
                  <option value="">{t('selectVoiceChannel')}</option>
                  {voiceChannels
                    .filter((c) => !usedChannelIds.has(c.id))
                    .map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        🔊 {ch.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label">{t('targetCategoryLabel')}</label>
                <select
                  className="input"
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value)}
                >
                  <option value="">{t('sameCategory')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      📁 {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newChannelId || addMutation.isPending}
              className="btn-primary mt-3 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {addMutation.isPending ? t('adding') : t('addTrigger')}
            </button>
          </div>
        </div>
      </SettingsSection>

      <div className="card mt-4 bg-discord-blurple/5 border border-discord-blurple/20">
        <h3 className="text-sm font-semibold text-discord-blurple mb-2">{t('howItWorks')}</h3>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>{t('how1')}</li>
          <li>{t('how2')}</li>
          <li>{t('how3')}</li>
          <li>{t('how4')}</li>
          <li>{t('how5')}</li>
          <li>{t('how6')}</li>
        </ul>
      </div>
    </div>
  );
}
