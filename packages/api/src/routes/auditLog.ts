import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

export async function auditLogRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/audit-log', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));

    const [entries, total] = await Promise.all([
      prisma.dashboardAuditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dashboardAuditLog.count({ where: { guildId } }),
    ]);

    return reply.send({ success: true, data: { entries, total, page, pages: Math.ceil(total / limit) } });
  });
}
