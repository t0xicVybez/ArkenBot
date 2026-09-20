/**
 * Shared RCON action layer for gameadmin: builds and runs console commands,
 * writes an audit-log entry per action, and drives scheduled tasks. The slash
 * command, the control-panel buttons, and the scheduler all go through here so
 * behaviour (and audit logging) stays identical across entry points.
 */
import { EmbedBuilder, type Guild, type TextChannel } from 'discord.js';
import type { AddonContext, AddonStorage } from '@arkenbot/addon-sdk';
import { GAMES, runGameCommand } from './games.js';
import { decryptCredential } from './crypto.js';
import { getServers } from './storage.js';
import type { SavedGameServer } from './types.js';

export type RconAction = 'players' | 'say' | 'kick' | 'ban' | 'unban' | 'save' | 'stop';
type Translate = (key: string, vars?: Record<string, string | number>) => string;

// ─── Config (audit log channel) ───────────────────────────────────────────────
export interface GaConfig { logChannelId?: string }
const CFG_KEY = 'gaConfig';
export async function getConfig(storage: AddonStorage, guildId: string): Promise<GaConfig> {
  return (await storage.get<GaConfig>(CFG_KEY, guildId)) ?? {};
}
export async function setConfig(storage: AddonStorage, guildId: string, cfg: GaConfig): Promise<void> {
  await storage.set(CFG_KEY, cfg, guildId);
}

// ─── Schedules ────────────────────────────────────────────────────────────────
export type ScheduleAction = 'save' | 'restart' | 'broadcast';
export interface Schedule {
  id: string;
  serverId: string;
  action: ScheduleAction;
  message?: string;
  intervalMs: number;
  nextRun: number;
}
const SCHED_KEY = 'schedules';
export async function getSchedules(storage: AddonStorage, guildId: string): Promise<Schedule[]> {
  return (await storage.get<Schedule[]>(SCHED_KEY, guildId)) ?? [];
}
export async function setSchedules(storage: AddonStorage, guildId: string, list: Schedule[]): Promise<void> {
  await storage.set(SCHED_KEY, list, guildId);
}
export const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 3_600_000, every6h: 6 * 3_600_000, every12h: 12 * 3_600_000, daily: 24 * 3_600_000,
};

// ─── Command building + running ───────────────────────────────────────────────
export function buildActionCommand(
  server: SavedGameServer,
  action: RconAction,
  args: { message?: string; player?: string; reason?: string } = {},
): string | null {
  const cmd = GAMES[server.game]?.cmd[action];
  if (cmd === undefined) return null;
  if (action === 'say') return (cmd as (m: string) => string)(args.message ?? '');
  if (action === 'kick' || action === 'ban') return (cmd as (t: string, r?: string) => string)(args.player ?? '', args.reason);
  if (action === 'unban') return (cmd as (t: string) => string)(args.player ?? '');
  return cmd as string;
}

export async function runServerCommand(server: SavedGameServer, rawCommand: string): Promise<string> {
  const password = decryptCredential(server.password);
  return runGameCommand(server.game, server.host, server.port, password, rawCommand);
}

// ─── Audit log ────────────────────────────────────────────────────────────────
export async function postAudit(
  ctx: AddonContext,
  guild: Guild,
  opts: { userId: string; server: SavedGameServer; action: string; detail?: string; ok: boolean },
): Promise<void> {
  const cfg = await getConfig(ctx.storage, guild.id);
  if (!cfg.logChannelId) return;
  const channel = guild.channels.cache.get(cfg.logChannelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;

  const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
  const t: Translate = (k, v) => ctx.t(k, loc, v);
  const embed = new EmbedBuilder()
    .setColor(opts.ok ? 0x5865f2 : 0xed4245)
    .setAuthor({ name: t('gameadmin.auditTitle', { server: opts.server.name }) })
    .setDescription(
      t('gameadmin.auditLine', { user: `<@${opts.userId}>`, action: opts.action }) +
      (opts.detail ? `\n\`\`\`${opts.detail.slice(0, 500)}\`\`\`` : ''),
    )
    .setFooter({ text: opts.ok ? t('gameadmin.auditOk') : t('gameadmin.auditFail') })
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
export async function runDueSchedules(ctx: AddonContext): Promise<void> {
  const now = Date.now();
  for (const guild of ctx.client.guilds.cache.values()) {
    try {
      const schedules = await getSchedules(ctx.storage, guild.id);
      if (schedules.length === 0) continue;
      let changed = false;
      const servers = await getServers(ctx.storage, guild.id);
      for (const sch of schedules) {
        if (sch.nextRun > now) continue;
        sch.nextRun = now + sch.intervalMs;
        changed = true;
        const server = servers.find((s) => s.id === sch.serverId);
        if (server) void runSchedule(ctx, guild, server, sch);
      }
      if (changed) await setSchedules(ctx.storage, guild.id, schedules);
    } catch (err) {
      ctx.logger.error(`gameadmin scheduler failed for guild ${guild.id}`, String(err));
    }
  }
}

async function runSchedule(ctx: AddonContext, guild: Guild, server: SavedGameServer, sch: Schedule): Promise<void> {
  const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
  const t: Translate = (k, v) => ctx.t(k, loc, v);
  const label = t('gameadmin.scheduledAction', { action: sch.action });
  const botId = ctx.client.user?.id ?? '';
  try {
    if (sch.action === 'broadcast') {
      const cmd = buildActionCommand(server, 'say', { message: sch.message ?? '' });
      if (cmd) await runServerCommand(server, cmd);
    } else if (sch.action === 'save') {
      const cmd = buildActionCommand(server, 'save');
      if (cmd) await runServerCommand(server, cmd);
    } else if (sch.action === 'restart') {
      const warn = buildActionCommand(server, 'say', { message: t('gameadmin.restartWarn') });
      if (warn) await runServerCommand(server, warn).catch(() => {});
      await new Promise((r) => setTimeout(r, 60_000)); // 1-minute warning window
      const save = buildActionCommand(server, 'save');
      if (save) await runServerCommand(server, save).catch(() => {});
      const stop = buildActionCommand(server, 'stop');
      if (stop) await runServerCommand(server, stop);
    }
    await postAudit(ctx, guild, { userId: botId, server, action: label, ok: true });
  } catch (err) {
    await postAudit(ctx, guild, { userId: botId, server, action: label, detail: String(err), ok: false });
  }
}
