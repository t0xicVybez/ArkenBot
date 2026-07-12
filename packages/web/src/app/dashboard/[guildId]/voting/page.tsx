'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { topggApi, guildsApi } from '@/lib/api';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import { ThumbsUp } from 'lucide-react';

type GuildRole = { id: string; name: string };
type GuildChannel = { id: string; name: string; type: number };

type TopggConfig = {
  enabled: boolean;
  voterRoleId: string | null;
  voterRoleHours: number;
  xpReward: number;
  weekendDouble: boolean;
  announceChannelId: string | null;
  announceMessage: string;
};

type Voter = { userId: string; totalVotes: number; currentStreak: number; longestStreak: number; lastVotedAt: string | null };

export default function VotingPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['topgg', guildId],
    queryFn: () => topggApi.getConfig(guildId),
  });
  const { data: rolesRes } = useQuery({ queryKey: ['roles', guildId], queryFn: () => guildsApi.roles(guildId) });
  const { data: channelsRes } = useQuery({ queryKey: ['channels', guildId], queryFn: () => guildsApi.channels(guildId) });
  const { data: lbRes } = useQuery({ queryKey: ['topgg-lb', guildId], queryFn: () => topggApi.getLeaderboard(guildId), refetchInterval: 60000 });

  const allRoles = (rolesRes?.data?.data ?? []) as GuildRole[];
  const textChannels = ((channelsRes?.data?.data ?? []) as GuildChannel[]).filter((c) => c.type === 0);
  const leaderboard = (lbRes?.data?.data ?? { voters: [], totalVotes: 0, uniqueVoters: 0 }) as {
    voters: Voter[]; totalVotes: number; uniqueVoters: number;
  };

  const [config, setConfig] = useState<Partial<TopggConfig>>({});
  useEffect(() => {
    if (configRes?.data?.data) setConfig(configRes.data.data as TopggConfig);
  }, [configRes]);

  const mutation = useMutation({
    mutationFn: (data: Partial<TopggConfig>) => topggApi.updateConfig(guildId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['topgg', guildId] }),
  });

  const save = (partial: Partial<TopggConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
    mutation.mutate(partial);
  };

  if (isLoading) {
    return <div className="p-6"><div className="card animate-pulse h-40" /></div>;
  }

  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="page-head">
        <div className="page-head-icon"><ThumbsUp className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Vote Rewards</h1>
          <div className="page-head-desc">Reward members for voting for the bot on top.gg</div>
        </div>
      </div>

      <SettingsSection
        title="Vote Rewards"
        description="When a member votes for the bot on top.gg, reward them here. Voting is free and resets every 12 hours. Weekend votes count double."
      >
        <Toggle
          label="Enable vote rewards"
          description="Grant the rewards below to members of this server when they vote"
          enabled={config.enabled ?? false}
          onChange={(v) => save({ enabled: v })}
        />

        {config.enabled && (
          <div className="mt-4 space-y-5">
            <div>
              <label className="label">Voter role</label>
              <p className="text-xs text-[var(--text-muted)] mb-2">A temporary role granted on each vote, removed automatically after the duration.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  className="input flex-1"
                  value={config.voterRoleId ?? ''}
                  onChange={(e) => save({ voterRoleId: e.target.value || null })}
                >
                  <option value="">No role</option>
                  {allRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={168}
                    className="input w-24"
                    value={config.voterRoleHours ?? 12}
                    onChange={(e) => save({ voterRoleHours: Math.max(1, Math.min(168, parseInt(e.target.value) || 12)) })}
                  />
                  <span className="text-sm text-[var(--text-muted)]">hours</span>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Bonus XP per vote</label>
              <p className="text-xs text-[var(--text-muted)] mb-2">Added to the member's leveling XP. Set 0 to disable.</p>
              <input
                type="number" min={0} max={100000}
                className="input w-40"
                value={config.xpReward ?? 0}
                onChange={(e) => save({ xpReward: Math.max(0, Math.min(100000, parseInt(e.target.value) || 0)) })}
              />
            </div>

            <Toggle
              label="Double rewards on weekends"
              description="Weekend votes count double on top.gg — double the XP reward to match"
              enabled={config.weekendDouble ?? true}
              onChange={(v) => save({ weekendDouble: v })}
            />

            <div>
              <label className="label">Announcement channel</label>
              <p className="text-xs text-[var(--text-muted)] mb-2">Post a public thank-you when a member votes. Leave empty to disable.</p>
              <select
                className="input"
                value={config.announceChannelId ?? ''}
                onChange={(e) => save({ announceChannelId: e.target.value || null })}
              >
                <option value="">No announcement</option>
                {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>

            {config.announceChannelId && (
              <div>
                <label className="label">Announcement message</label>
                <p className="text-xs text-[var(--text-muted)] mb-2">Placeholders: <code>{'{user}'}</code>, <code>{'{url}'}</code>, <code>{'{streak}'}</code>, <code>{'{count}'}</code></p>
                <textarea
                  className="input min-h-20"
                  value={config.announceMessage ?? ''}
                  maxLength={1000}
                  onChange={(e) => setConfig((c) => ({ ...c, announceMessage: e.target.value }))}
                  onBlur={(e) => save({ announceMessage: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Top Voters" description="The bot's most dedicated voters across all servers.">
        <div className="flex gap-6 mb-4 text-sm">
          <div><span className="text-2xl font-bold text-white">{leaderboard.totalVotes}</span><span className="text-[var(--text-muted)] ml-2">total votes</span></div>
          <div><span className="text-2xl font-bold text-white">{leaderboard.uniqueVoters}</span><span className="text-[var(--text-muted)] ml-2">unique voters</span></div>
        </div>
        {leaderboard.voters.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No votes recorded yet.</p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {leaderboard.voters.map((v, i) => (
              <div key={v.userId} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-300">{['🥇','🥈','🥉'][i] ?? `${i + 1}.`} <span className="font-mono text-xs text-gray-500">{v.userId}</span></span>
                <span className="text-[var(--text-secondary)]">{v.totalVotes} votes · {v.currentStreak}🔥 streak</span>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <p className="text-xs text-[var(--text-muted)]">
        Rewards trigger the moment a member votes at{' '}
        <a className="text-discord-blurple hover:underline" href="https://top.gg" target="_blank" rel="noopener noreferrer">top.gg</a>.
        Members can check their status and turn on reminders with <code>/vote</code>.
      </p>
    </div>
  );
}
