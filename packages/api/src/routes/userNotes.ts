/**
 * REST routes for per-user staff notes.
 */
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

export async function userNoteRoutes(server: FastifyInstance): Promise<void> {

  // GET /guilds/:guildId/user-notes/:userId — list notes for a user
  server.get('/guilds/:guildId/user-notes/:userId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    const notes = await prisma.userNote.findMany({
      where: { guildId, userId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: notes });
  });

  // POST /guilds/:guildId/user-notes/:userId — create a note
  server.post('/guilds/:guildId/user-notes/:userId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    const { content } = request.body as { content?: string };

    if (!content?.trim()) return reply.code(400).send({ success: false, error: 'content is required' });

    const portalUser = (request as unknown as { user?: { id: string; username: string } }).user;
    const staffId = portalUser?.id ?? 'portal';
    const staffTag = portalUser?.username ?? 'Dashboard';

    const note = await prisma.userNote.create({
      data: { guildId, userId, staffId, staffTag, content: content.trim() },
    });

    return reply.code(201).send({ success: true, data: note });
  });

  // DELETE /guilds/:guildId/user-notes/:noteId — delete a note
  server.delete('/guilds/:guildId/user-notes/:noteId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, noteId } = request.params as { guildId: string; noteId: string };

    const existing = await prisma.userNote.findFirst({ where: { id: noteId, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Note not found' });

    await prisma.userNote.delete({ where: { id: noteId } });
    return reply.send({ success: true, message: 'Deleted' });
  });
}
