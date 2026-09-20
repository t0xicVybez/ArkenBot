/**
 * Live monitoring for saved game servers: a poll loop that (optionally, per
 * guild) keeps an auto-updating status board, posts up/down alerts, and shows
 * the total online player count in a voice-channel name. All three ride on the
 * same poll so servers are queried once per cycle.
 */
import { EmbedBuilder, type Guild, type TextChannel, type VoiceChannel } from 'discord.js';
import type { AddonContext, AddonStorage } from '@arkenbot/addon-sdk';
import { getServers } from './utils/storage.js';
import { queryServer } from './query.js';
import { decryptCredential } from './utils/crypto.js';
import { buildCheckAllEmbed } from './utils/embeds.js';
import type { SavedServer, ServerStatus, QueryResult } from './types.js';

export interface MonitorConfig {
  boardChannelId?: string;
  boardMessageId?: string;
  alertChannelId?: string;
  statChannelId?: string;
}

interface MonitorState {
  online: Record<string, boolean>;
  statValue?: number;
  statRenamedAt?: number;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const CFG_KEY = 'monitor';
const STATE_KEY = 'monitorState';
export const POLL_INTERVAL_MS = 3 * 60 * 1000;
// Discord rate-limits channel renames hard (~2 per 10 min); only rename when the
// value changed and at least this long since the last rename.
const STAT_RENAME_COOLDOWN_MS = 5 * 60 * 1000;

export async function getMonitorConfig(storage: AddonStorage, guildId: string): Promise<MonitorConfig> {
  return (await storage.get<MonitorConfig>(CFG_KEY, guildId)) ?? {};
}
export async function setMonitorConfig(storage: AddonStorage, guildId: string, cfg: MonitorConfig): Promise<void> {
  await storage.set(CFG_KEY, cfg, guildId);
}

function authFor(server: SavedServer): { password: string; queryPort?: number } | undefined {
  if (!server.credential) return undefined;
  try {
    return { password: decryptCredential(server.credential), queryPort: server.queryPort };
  } catch {
    return undefined;
  }
}

type Result = { server: SavedServer; status: ServerStatus };

async function queryAll(servers: SavedServer[]): Promise<Result[]> {
  return Promise.all(
    servers.map(async (s) => ({
      server: s,
      status: await queryServer(s.game, s.host, s.port, authFor(s)).catch(
        () => ({ online: false, error: 'query failed' }) as ServerStatus,
      ),
    })),
  );
}

/** Polls every guild that has any monitoring configured, once per cycle. */
export async function pollAllGuilds(ctx: AddonContext): Promise<void> {
  for (const guild of ctx.client.guilds.cache.values()) {
    try {
      const cfg = await getMonitorConfig(ctx.storage, guild.id);
      if (!cfg.boardChannelId && !cfg.alertChannelId && !cfg.statChannelId) continue;
      const servers = await getServers(ctx.storage, guild.id);
      if (servers.length === 0) continue;

      const results = await queryAll(servers);
      const state = (await ctx.storage.get<MonitorState>(STATE_KEY, guild.id)) ?? { online: {} };
      const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
      const t: Translate = (k, v) => ctx.t(k, loc, v);

      if (cfg.boardChannelId) await updateBoard(ctx, guild, cfg, results, t);
      if (cfg.alertChannelId) await checkAlerts(ctx, guild, cfg, results, state, t);
      if (cfg.statChannelId) await updateStatChannel(guild, cfg, results, state);

      const online: Record<string, boolean> = {};
      for (const r of results) online[r.server.id] = r.status.online;
      state.online = online;
      await ctx.storage.set(STATE_KEY, state, guild.id);
    } catch (err) {
      ctx.logger.error(`Game monitor poll failed for guild ${guild.id}`, String(err));
    }
  }
}

async function updateBoard(ctx: AddonContext, guild: Guild, cfg: MonitorConfig, results: Result[], t: Translate): Promise<void> {
  const channel = guild.channels.cache.get(cfg.boardChannelId!) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;
  const embed = buildCheckAllEmbed(results, guild.name, t);

  if (cfg.boardMessageId) {
    const msg = await channel.messages.fetch(cfg.boardMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => {});
      return;
    }
  }
  const sent = await channel.send({ embeds: [embed] }).catch(() => null);
  if (sent) {
    cfg.boardMessageId = sent.id;
    await setMonitorConfig(ctx.storage, guild.id, cfg);
  }
}

async function checkAlerts(ctx: AddonContext, guild: Guild, cfg: MonitorConfig, results: Result[], state: MonitorState, t: Translate): Promise<void> {
  const channel = guild.channels.cache.get(cfg.alertChannelId!) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;

  for (const { server, status } of results) {
    const prev = state.online[server.id];
    if (prev === undefined) continue; // first observation — establish baseline, don't alert
    if (prev === status.online) continue;

    const embed = new EmbedBuilder()
      .setTitle(status.online ? t('alertUpTitle', { name: server.name }) : t('alertDownTitle', { name: server.name }))
      .setColor(status.online ? 0x57f287 : 0xed4245)
      .setTimestamp();
    if (status.online) {
      const s = status as QueryResult;
      embed.setDescription(t('alertUpDesc', { players: s.players, max: s.maxPlayers }));
    } else {
      embed.setDescription(t('alertDownDesc'));
    }
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

async function updateStatChannel(guild: Guild, cfg: MonitorConfig, results: Result[], state: MonitorState): Promise<void> {
  const channel = guild.channels.cache.get(cfg.statChannelId!) as VoiceChannel | undefined;
  if (!channel) return;

  const totalPlayers = results.reduce((sum, r) => sum + (r.status.online ? (r.status as QueryResult).players : 0), 0);
  const now = Date.now();
  if (state.statValue === totalPlayers) return;
  if (state.statRenamedAt && now - state.statRenamedAt < STAT_RENAME_COOLDOWN_MS) return;

  const name = `🎮 ${totalPlayers} playing`;
  const ok = await channel.setName(name).then(() => true).catch(() => false);
  if (ok) {
    state.statValue = totalPlayers;
    state.statRenamedAt = now;
  }
}
