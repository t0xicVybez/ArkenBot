/**
 * Read-only dashboard endpoints for the gameservers and gameadmin addons. They
 * surface what's configured (saved servers, monitoring, schedules, player-count
 * history) without ever exposing the encrypted credentials/passwords stored
 * alongside them.
 */
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

async function addonId(name: string): Promise<string | null> {
  const addon = await prisma.addon.findUnique({ where: { name }, select: { id: true } });
  return addon?.id ?? null;
}

async function readKey<T>(guildId: string, name: string, key: string): Promise<T | null> {
  const id = await addonId(name);
  if (!id) return null;
  const row = await prisma.addonData.findUnique({
    where: { guildId_addonId_key: { guildId, addonId: id, key } },
    select: { value: true },
  });
  return (row?.value as T) ?? null;
}

export async function gameAddonRoutes(server: FastifyInstance): Promise<void> {
  // ── Game Server Status (gameservers) ─────────────────────────────────────────
  server.get('/guilds/:guildId/addons/gameservers', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const servers = (await readKey<Array<Record<string, unknown>>>(guildId, 'gameservers', 'servers')) ?? [];
    const monitor = (await readKey<Record<string, unknown>>(guildId, 'gameservers', 'monitor')) ?? {};
    const history = (await readKey<Record<string, Array<{ t: number; p: number }>>>(guildId, 'gameservers', 'history')) ?? {};

    // Strip the encrypted credential; keep only safe display fields + a compact
    // history series (player counts) per server for a sparkline.
    const safe = servers.map((s) => ({
      id: s.id,
      name: s.name,
      game: s.game,
      host: s.host,
      port: s.port ?? null,
      history: (history[s.id as string] ?? []).slice(-96).map((h) => h.p),
    }));

    return reply.send({
      success: true,
      data: {
        installed: (await addonId('gameservers')) !== null,
        servers: safe,
        monitor: {
          boardChannelId: monitor.boardChannelId ?? null,
          alertChannelId: monitor.alertChannelId ?? null,
          statChannelId: monitor.statChannelId ?? null,
        },
      },
    });
  });

  // ── Game Server Admin (gameadmin) ────────────────────────────────────────────
  server.get('/guilds/:guildId/addons/gameadmin', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const servers = (await readKey<Array<Record<string, unknown>>>(guildId, 'gameadmin', 'servers')) ?? [];
    const config = (await readKey<Record<string, unknown>>(guildId, 'gameadmin', 'gaConfig')) ?? {};
    const schedules = (await readKey<Array<Record<string, unknown>>>(guildId, 'gameadmin', 'schedules')) ?? [];

    // Never expose the encrypted RCON password.
    const safeServers = servers.map((s) => ({ id: s.id, name: s.name, game: s.game, host: s.host, port: s.port }));
    const safeSchedules = schedules.map((s) => {
      const srv = servers.find((x) => x.id === s.serverId);
      return { id: s.id, action: s.action, serverName: srv?.name ?? s.serverId, intervalMs: s.intervalMs, nextRun: s.nextRun, message: s.message ?? null };
    });

    return reply.send({
      success: true,
      data: {
        installed: (await addonId('gameadmin')) !== null,
        servers: safeServers,
        logChannelId: config.logChannelId ?? null,
        schedules: safeSchedules,
      },
    });
  });
}
