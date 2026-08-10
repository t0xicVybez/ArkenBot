import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';

export async function moderationRoutes(server: FastifyInstance): Promise<void> {
  // GET /guilds/:guildId/cases
  server.get('/guilds/:guildId/cases', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { page?: string; pageSize?: string; type?: string; userId?: string };

    const page = Math.max(1, parseInt(query.page ?? '1')) - 1;
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '20'));

    const where = {
      guildId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [cases, total] = await Promise.all([
      prisma.moderationCase.findMany({
        where,
        orderBy: { caseNumber: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.moderationCase.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: cases, total, page: page + 1, pageSize, hasMore: (page + 1) * pageSize < total },
    });
  });

  // GET /guilds/:guildId/cases/:caseNumber
  server.get('/guilds/:guildId/cases/:caseNumber', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, caseNumber } = request.params as { guildId: string; caseNumber: string };

    const modCase = await prisma.moderationCase.findUnique({
      where: { guildId_caseNumber: { guildId, caseNumber: parseInt(caseNumber) } },
    });

    if (!modCase) return reply.code(404).send({ success: false, error: 'Case not found' });

    return reply.send({ success: true, data: modCase });
  });

  // PATCH /guilds/:guildId/cases/:caseNumber - Update reason
  server.patch('/guilds/:guildId/cases/:caseNumber', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, caseNumber } = request.params as { guildId: string; caseNumber: string };
    const input = parse(z.object({ reason: z.string().trim().min(1).max(512) }), request.body, reply);
    if (!input) return;

    const updated = await prisma.moderationCase.update({
      where: { guildId_caseNumber: { guildId, caseNumber: parseInt(caseNumber) } },
      data: { reason: input.reason },
    });

    return reply.send({ success: true, data: updated });
  });

  // GET /guilds/:guildId/warnings
  server.get('/guilds/:guildId/warnings', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { userId?: string; active?: string };

    const warnings = await prisma.warning.findMany({
      where: {
        guildId,
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.active !== undefined ? { active: query.active === 'true' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: warnings });
  });

  // DELETE /guilds/:guildId/warnings/:id - Clear a single warning
  server.delete('/guilds/:guildId/warnings/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };

    const warning = await prisma.warning.findFirst({ where: { id, guildId } });
    if (!warning) return reply.code(404).send({ success: false, error: 'Warning not found' });

    await prisma.warning.update({ where: { id }, data: { active: false } });

    // Record the clear action as a case
    const lastCase = await prisma.moderationCase.findFirst({ where: { guildId }, orderBy: { caseNumber: 'desc' } });
    const caseNumber = (lastCase?.caseNumber ?? 0) + 1;
    const portalUserId = (request as unknown as { user?: { id: string; username: string } }).user;
    await prisma.moderationCase.create({
      data: {
        caseNumber,
        guildId,
        type: 'clearwarn',
        userId: warning.userId,
        userTag: warning.userTag,
        moderatorId: portalUserId?.id ?? 'portal',
        moderatorTag: portalUserId?.username ?? 'Dashboard',
        reason: 'Warning cleared via dashboard',
        active: false,
      },
    });

    return reply.send({ success: true, message: 'Warning cleared' });
  });

  // DELETE /guilds/:guildId/warnings - Bulk-clear all active warnings for a user
  server.delete('/guilds/:guildId/warnings', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { userId } = request.query as { userId?: string };

    if (!userId) return reply.code(400).send({ success: false, error: 'userId query parameter required' });

    // Grab info before clearing
    const sample = await prisma.warning.findFirst({ where: { guildId, userId, active: true } });

    const result = await prisma.warning.updateMany({
      where: { guildId, userId, active: true },
      data: { active: false },
    });

    if (result.count > 0 && sample) {
      const lastCase = await prisma.moderationCase.findFirst({ where: { guildId }, orderBy: { caseNumber: 'desc' } });
      const caseNumber = (lastCase?.caseNumber ?? 0) + 1;
      const portalUser = (request as unknown as { user?: { id: string; username: string } }).user;
      await prisma.moderationCase.create({
        data: {
          caseNumber,
          guildId,
          type: 'clearwarn',
          userId,
          userTag: sample.userTag,
          moderatorId: portalUser?.id ?? 'portal',
          moderatorTag: portalUser?.username ?? 'Dashboard',
          reason: `Cleared ${result.count} warning(s) via dashboard`,
          active: false,
        },
      });
    }

    return reply.send({ success: true, data: { cleared: result.count } });
  });

  // GET /guilds/:guildId/logs
  server.get('/guilds/:guildId/logs', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { page?: string; pageSize?: string; type?: string; userId?: string; dateFrom?: string; dateTo?: string };

    const page = Math.max(1, parseInt(query.page ?? '1')) - 1;
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '50'));

    const where: Record<string, unknown> = {
      guildId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(new Date(query.dateTo).setHours(23, 59, 59, 999)) } : {}),
      };
    }

    const [entries, total] = await Promise.all([
      prisma.logEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.logEntry.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: entries, total, page: page + 1, pageSize, hasMore: (page + 1) * pageSize < total },
    });
  });
}
