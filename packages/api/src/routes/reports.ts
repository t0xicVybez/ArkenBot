/**
 * REST routes for the report system and report config.
 */
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

export async function reportRoutes(server: FastifyInstance): Promise<void> {

  // GET /guilds/:guildId/reports?status=pending — list reports
  server.get('/guilds/:guildId/reports', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { status?: string };

    const reports = await prisma.report.findMany({
      where: {
        guildId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: reports });
  });

  // GET /guilds/:guildId/reports/:reportId — get single report
  server.get('/guilds/:guildId/reports/:reportId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, reportId } = request.params as { guildId: string; reportId: string };

    const report = await prisma.report.findFirst({ where: { id: reportId, guildId } });
    if (!report) return reply.code(404).send({ success: false, error: 'Report not found' });

    return reply.send({ success: true, data: report });
  });

  // PATCH /guilds/:guildId/reports/:reportId — update status / staffNote
  server.patch('/guilds/:guildId/reports/:reportId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, reportId } = request.params as { guildId: string; reportId: string };
    const body = request.body as { status?: string; staffNote?: string };

    const existing = await prisma.report.findFirst({ where: { id: reportId, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Report not found' });

    const portalUser = (request as unknown as { user?: { id: string; username: string } }).user;

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.staffNote !== undefined && { staffNote: body.staffNote }),
        ...(body.status !== undefined && portalUser && {
          reviewerId: portalUser.id,
          reviewerTag: portalUser.username,
        }),
      },
    });

    return reply.send({ success: true, data: updated });
  });

  // GET /guilds/:guildId/report-config — read extended.reportConfig
  server.get('/guilds/:guildId/report-config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const settings = await prisma.guildSettings.findUnique({ where: { guildId }, select: { extended: true } });
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    return reply.send({ success: true, data: extended.reportConfig ?? {} });
  });

  // PATCH /guilds/:guildId/report-config — write extended.reportConfig
  server.patch('/guilds/:guildId/report-config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId } = request.body as { channelId?: string | null };

    const settings = await prisma.guildSettings.findUnique({ where: { guildId }, select: { extended: true } });
    const extended = { ...((settings?.extended ?? {}) as Record<string, unknown>) };
    extended.reportConfig = { ...(extended.reportConfig as Record<string, unknown> ?? {}), ...(channelId !== undefined && { channelId }) };

    await prisma.guildSettings.upsert({
      where: { guildId },
      update: { extended: extended as import('@prisma/client').Prisma.InputJsonValue },
      create: { guildId, extended: extended as import('@prisma/client').Prisma.InputJsonValue },
    });

    await pub.publish('cache:invalidate:settings', guildId);

    return reply.send({ success: true, data: extended.reportConfig });
  });
}
