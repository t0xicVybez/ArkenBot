import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Dashboard audit log read endpoint. The recording hook lives in server.ts
 * (root scope) so it observes every route; Fastify hooks added inside a
 * plugin only apply to that plugin's own routes.
 */

export async function auditLogRoutes(server: FastifyInstance): Promise<void> {
  // ── GET /guilds/:guildId/audit-log ────────────────────────────────────────
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
