/**
 * Per-user preferences shared with the bot. Currently the language the user
 * wants the dashboard and bot to use. Writing here keeps the dashboard's
 * language switcher and the bot's /language command in sync (both read/write
 * the same UserPreferences row keyed by Discord user ID).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';
import { isSupportedLocale } from '@arkenbot/shared';

export async function userPreferencesRoutes(server: FastifyInstance): Promise<void> {
  server.get('/me/language', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = (request as { user?: { id: string } }).user!.id;
    const pref = await prisma.userPreferences.findUnique({ where: { userId }, select: { language: true } });
    return reply.send({ success: true, data: { language: pref?.language ?? null } });
  });

  server.patch('/me/language', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = (request as { user?: { id: string } }).user!.id;
    const body = parse(z.object({ language: z.string().nullable() }), request.body, reply);
    if (!body) return;
    // Only persist a recognised locale; anything else clears the preference.
    const language = body.language && isSupportedLocale(body.language) ? body.language : null;
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, language },
      update: { language },
    });
    return reply.send({ success: true, data: { language } });
  });
}
