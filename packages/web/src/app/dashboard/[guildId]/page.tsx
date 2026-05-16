'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { guildsApi, activityApi, suggestionsApi, giveawaysApi } from '@/lib/api';
import { Shield, Users, TrendingUp, MessageSquare, Bot, Music, Check, X, Zap, Gift, Sparkles, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useWebSocket } from '@/lib/socket';
import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const statColors = {
  red:    { ring: 'ring-red-500/20',    bg: 'bg-red-500/10',    text: 'text-red-400' },
  green:  { ring: 'ring-green-500/20',  bg: 'bg-green-500/10',  text: 'text-green-400' },
  yellow: { ring: 'ring-yellow-500/20', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  blue:   { ring: 'ring-blue-500/20',   bg: 'bg-blue-500/10',   text: 'text-blue-400' },
};

function StatCard({ title, value, icon: Icon, color = 'blue' }: {
  title: string; value: number; icon: LucideIcon; color?: keyof typeof statColors;
}) {
  const c = statColors[color];
  return (
    <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${c.bg} ring-1 ${c.ring} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-white leading-tight">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-yellow-500/20 text-yellow-300',
  approved:    'bg-green-500/20 text-green-300',
  denied:      'bg-red-500/20 text-red-300',
  considering: 'bg-blue-500/20 text-blue-300',
};

export default function GuildOverviewPage() {
  const { guildId } = useParams() as { guildId: string };
  const [liveEvents, setLiveEvents] = useState<{ id: number; label: string; type: 'mod' | 'member'; ts: number }[]>([]);
  const eventIdRef = useRef(0);

  // Auto-expire events older than 5 minutes
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      setLiveEvents((prev) => prev.filter((e) => e.ts > cutoff));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const { data: analyticsRes } = useQuery({
    queryKey: ['guild-analytics', guildId],
    queryFn: () => guildsApi.analytics(guildId),
    refetchInterval: 30000,
  });

  const { data: guildRes } = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => guildsApi.get(guildId),
  });

  const { data: activityRes } = useQuery({
    queryKey: ['activity', guildId],
    queryFn: () => activityApi.get(guildId, 14),
    refetchInterval: 60000,
  });

  const { data: suggestionsRes } = useQuery({
    queryKey: ['suggestions-overview', guildId],
    queryFn: () => suggestionsApi.list(guildId),
    refetchInterval: 60000,
  });

  const { data: giveawaysRes } = useQuery({
    queryKey: ['giveaways-active', guildId],
    queryFn: () => giveawaysApi.list(guildId, false),
    refetchInterval: 60000,
  });

  const analytics = analyticsRes?.data?.data;
  const guild = guildRes?.data?.data as {
    settings?: Record<string, unknown>;
    welcomeConfig?: Record<string, unknown>;
    automodConfig?: Record<string, unknown>;
    guildAddons?: Array<{ addon: { displayName: string } }>;
  } | undefined;

  const activityData = ((activityRes?.data as { data?: { date: string; count: number }[] })?.data ?? []).map((row) => ({
    date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Messages: row.count,
  }));

  const allSuggestions = (suggestionsRes?.data?.data ?? []) as Array<{
    id: string; content: string; status: string; upvotes: number; downvotes: number; createdAt: string;
  }>;
  // Sort oldest-first then take the five most recent by creation date.
  const recentSuggestions = [...allSuggestions]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-5);

  const activeGiveaways = (giveawaysRes?.data?.data ?? []) as Array<{
    id: string; prize: string; endsAt: string; winnersCount: number;
  }>;

  useWebSocket('member:join', (event) => {
    if (event.guildId === guildId) {
      const id = ++eventIdRef.current;
      setLiveEvents((prev) => [{ id, label: `${(event.data as { userTag: string }).userTag} joined`, type: 'member', ts: Date.now() }, ...prev.slice(0, 19)]);
    }
  });

  useWebSocket('moderation:action', (event) => {
    if (event.guildId === guildId) {
      const d = event.data as { type: string; userTag: string };
      const id = ++eventIdRef.current;
      setLiveEvents((prev) => [{ id, label: `${d.type} — ${d.userTag}`, type: 'mod', ts: Date.now() }, ...prev.slice(0, 19)]);
    }
  });

  const amc = guild?.automodConfig;
  const autoModOn = !!(amc && (amc.antiSpamEnabled || amc.filterEnabled || amc.antiLinkEnabled || amc.antiMentionEnabled || amc.antiCapsEnabled || amc.antiRaidEnabled));

  const isNewGuild = guild && !guild.settings?.moderationEnabled && !guild.settings?.levelingEnabled && !guild.welcomeConfig?.welcomeEnabled && !autoModOn;

  const features = [
    { label: 'Moderation', icon: Shield, enabled: !!guild?.settings?.moderationEnabled },
    { label: 'Auto-Mod', icon: Bot, enabled: autoModOn },
    { label: 'Leveling', icon: TrendingUp, enabled: !!guild?.settings?.levelingEnabled },
    { label: 'Welcome', icon: MessageSquare, enabled: !!guild?.welcomeConfig?.welcomeEnabled },
    { label: 'Logging', icon: Zap, enabled: !!guild?.settings?.loggingEnabled },
    { label: 'Music', icon: Music, enabled: !!guild?.settings?.musicEnabled },
  ];

  const installedAddons = guild?.guildAddons ?? [];

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">Last 24 hours of activity</p>
      </div>

      {isNewGuild && (
        <Link
          href={`/dashboard/${guildId}/setup`}
          className="flex items-center justify-between gap-4 bg-discord-blurple/10 border border-discord-blurple/30 rounded-xl p-4 mb-6 hover:bg-discord-blurple/15 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-discord-blurple/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-discord-blurple" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">Finish setting up your server</p>
              <p className="text-gray-400 text-xs">No features are enabled yet — run the setup wizard to get started in minutes.</p>
            </div>
          </div>
          <span className="text-discord-blurple text-sm font-medium whitespace-nowrap group-hover:underline">Start setup →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard title="Mod Actions" value={analytics?.moderationActions24h ?? 0} icon={Shield} color="red" />
        <StatCard title="New Members" value={analytics?.newMembers24h ?? 0} icon={Users} color="green" />
        <StatCard title="Members Left" value={analytics?.leftMembers24h ?? 0} icon={Users} color="yellow" />
        <StatCard
          title="Log Events"
          value={analytics?.logEvents?.reduce((a: number, b: { _count: { type: number } }) => a + b._count.type, 0) ?? 0}
          icon={MessageSquare}
          color="blue"
        />
      </div>

      <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Message Activity — Last 14 Days</h2>
        {activityData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
            No activity yet — messages will be tracked automatically
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={activityData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5865F2" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#5865F2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e1f22', border: '1px solid #ffffff10', borderRadius: 8, color: '#fff', fontSize: 12 }}
                cursor={{ stroke: '#5865F2', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="Messages" stroke="#5865F2" strokeWidth={2} fill="url(#msgGradient)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Feature Status</h2>
          <div className="grid grid-cols-2 gap-2">
            {features.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-discord-darkest-bg border border-white/[0.04]"
              >
                <f.icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-300 flex-1 truncate">{f.label}</span>
                {f.enabled ? (
                  <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                ) : (
                  <X className="w-3 h-3 text-gray-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          {installedAddons.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 mt-4 mb-2">Addons</p>
              <div className="grid grid-cols-2 gap-2">
                {installedAddons.map((ga) => (
                  <div
                    key={ga.addon.displayName}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-discord-darkest-bg border border-white/[0.04]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-discord-blurple flex-shrink-0" />
                    <span className="text-xs text-gray-300 flex-1 truncate">{ga.addon.displayName}</span>
                    <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-white">Live Events</h2>
            <span className="flex items-center gap-1.5 text-[11px] text-green-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-[11px] text-gray-600 mb-3">
            Shows real-time member joins and moderation actions. Events expire after 5 minutes.
          </p>
          {liveEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-600 text-sm gap-2">
              <Zap className="w-6 h-6 text-gray-700" />
              <p>Waiting for events…</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {liveEvents.map((event) => {
                const age = Date.now() - event.ts;
                const mins = Math.floor(age / 60000);
                const timeLabel = mins === 0 ? 'just now' : `${mins}m ago`;
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-discord-darkest-bg border border-white/[0.04] animate-fade-in"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${event.type === 'mod' ? 'bg-red-400' : 'bg-green-400'}`} />
                    <span className="text-xs text-gray-300 truncate flex-1">{event.label}</span>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">{timeLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Recent Suggestions</h2>
          {recentSuggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-600 text-sm gap-2">
              <MessageSquare className="w-6 h-6 text-gray-700" />
              <p>No suggestions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSuggestions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-discord-darkest-bg border border-white/[0.04]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">{s.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] ?? 'bg-gray-700 text-gray-300'}`}>
                        {s.status}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        👍 {s.upvotes} · 👎 {s.downvotes}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-600 flex-shrink-0 mt-0.5">
                    {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-discord-darker-bg border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Active Giveaways</h2>
            {activeGiveaways.length > 0 && (
              <span className="text-[11px] text-discord-blurple font-medium">{activeGiveaways.length} running</span>
            )}
          </div>
          {activeGiveaways.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-600 text-sm gap-2">
              <Gift className="w-6 h-6 text-gray-700" />
              <p>No active giveaways</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeGiveaways.map((g) => {
                const endsAt = new Date(g.endsAt);
                const now = Date.now();
                const diffMs = endsAt.getTime() - now;
                const diffHours = Math.floor(diffMs / 3600000);
                const diffMins = Math.floor((diffMs % 3600000) / 60000);
                const timeLeft = diffMs <= 0
                  ? 'Ending…'
                  : diffHours > 0
                  ? `${diffHours}h ${diffMins}m left`
                  : `${diffMins}m left`;
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-discord-darkest-bg border border-white/[0.04]"
                  >
                    <Gift className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                    <span className="text-xs text-gray-300 flex-1 truncate">{g.prize}</span>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-discord-blurple font-medium">{timeLeft}</p>
                      <p className="text-[10px] text-gray-600">{g.winnersCount}w</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
