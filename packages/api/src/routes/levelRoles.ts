import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';

export async function levelRoleRoutes(server: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // LEVEL ROLES
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/level-roles
  server.get('/guilds/:guildId/level-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const roles = await prisma.levelRole.findMany({ where: { guildId }, orderBy: { level: 'asc' } });
    return reply.send({ success: true, data: roles });
  });

  // POST /guilds/:guildId/level-roles
  server.post('/guilds/:guildId/level-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const input = parse(z.object({
      level: z.coerce.number().int().min(1).max(1000),
      roleId: z.string().min(1).max(32),
    }), request.body, reply);
    if (!input) return;
    const role = await prisma.levelRole.upsert({
      where: { guildId_level: { guildId, level: input.level } },
      update: { roleId: input.roleId },
      create: { guildId, level: input.level, roleId: input.roleId },
    });
    return reply.code(201).send({ success: true, data: role });
  });

  // DELETE /guilds/:guildId/level-roles/:level
  server.delete('/guilds/:guildId/level-roles/:level', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, level } = request.params as { guildId: string; level: string };
    await prisma.levelRole.deleteMany({ where: { guildId, level: Number(level) } });
    return reply.code(204).send();
  });

  // ══════════════════════════════════════════════════════════════════
  // XP ROLE MULTIPLIERS
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/xp-multipliers
  server.get('/guilds/:guildId/xp-multipliers', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const multipliers = await prisma.xpRoleMultiplier.findMany({ where: { guildId }, orderBy: { multiplier: 'desc' } });
    return reply.send({ success: true, data: multipliers });
  });

  // POST /guilds/:guildId/xp-multipliers
  server.post('/guilds/:guildId/xp-multipliers', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { roleId, multiplier } = request.body as { roleId: string; multiplier: number };
    if (!roleId || !multiplier) return reply.code(400).send({ success: false, error: 'roleId and multiplier are required' });
    const record = await prisma.xpRoleMultiplier.upsert({
      where: { guildId_roleId: { guildId, roleId } },
      update: { multiplier: Number(multiplier) },
      create: { guildId, roleId, multiplier: Number(multiplier) },
    });
    return reply.code(201).send({ success: true, data: record });
  });

  // DELETE /guilds/:guildId/xp-multipliers/:roleId
  server.delete('/guilds/:guildId/xp-multipliers/:roleId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, roleId } = request.params as { guildId: string; roleId: string };
    await prisma.xpRoleMultiplier.deleteMany({ where: { guildId, roleId } });
    return reply.code(204).send();
  });

  // ══════════════════════════════════════════════════════════════════
  // XP CHANNEL MULTIPLIERS
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/xp-channel-multipliers
  server.get('/guilds/:guildId/xp-channel-multipliers', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const multipliers = await prisma.xpChannelMultiplier.findMany({ where: { guildId }, orderBy: { multiplier: 'desc' } });
    return reply.send({ success: true, data: multipliers });
  });

  // POST /guilds/:guildId/xp-channel-multipliers
  server.post('/guilds/:guildId/xp-channel-multipliers', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, multiplier } = request.body as { channelId: string; multiplier: number };
    if (!channelId || !multiplier) return reply.code(400).send({ success: false, error: 'channelId and multiplier are required' });
    const record = await prisma.xpChannelMultiplier.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      update: { multiplier: Number(multiplier) },
      create: { guildId, channelId, multiplier: Number(multiplier) },
    });
    return reply.code(201).send({ success: true, data: record });
  });

  // DELETE /guilds/:guildId/xp-channel-multipliers/:channelId
  server.delete('/guilds/:guildId/xp-channel-multipliers/:channelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, channelId } = request.params as { guildId: string; channelId: string };
    await prisma.xpChannelMultiplier.deleteMany({ where: { guildId, channelId } });
    return reply.code(204).send();
  });

  // ══════════════════════════════════════════════════════════════════
  // LEADERBOARD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════

  // POST /guilds/:guildId/leaderboard/reset-inactive
  // Resets XP to 0 for members who haven't been active for 90+ days
  server.post('/guilds/:guildId/leaderboard/reset-inactive', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await prisma.userLevel.updateMany({
      where: { guildId, updatedAt: { lt: cutoff } },
      data: { xp: 0, level: 0, totalMessages: 0, streakDays: 0 },
    });

    return reply.send({ success: true, data: { reset: result.count } });
  });
}
