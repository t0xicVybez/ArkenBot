
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

const ACHIEVEMENT_DEFS: Record<string, { name: string; description: string; emoji: string }> = {
  level_5:   { name: 'Rising Star',   description: 'Reach level 5',        emoji: '🥉' },
  level_10:  { name: 'Active Member', description: 'Reach level 10',       emoji: '🥈' },
  level_25:  { name: 'Veteran',       description: 'Reach level 25',       emoji: '🥇' },
  level_50:  { name: 'Elite',         description: 'Reach level 50',       emoji: '🔥' },
  level_100: { name: 'Legend',        description: 'Reach level 100',      emoji: '🌟' },
  msg_100:   { name: 'Chatty',        description: 'Send 100 messages',    emoji: '💬' },
  msg_500:   { name: 'Talkative',     description: 'Send 500 messages',    emoji: '🗣️' },
  msg_1000:  { name: 'Dedicated',     description: 'Send 1,000 messages',  emoji: '📢' },
  msg_5000:  { name: 'Unstoppable',   description: 'Send 5,000 messages',  emoji: '⚡' },
  msg_10000: { name: 'Transcendent',  description: 'Send 10,000 messages', emoji: '🏆' },
};

/**
 * Dashboard API for the leveling achievements catalogue and a guild's earned badges.
 *
 * Routes:
 *   GET    /guilds/:guildId/achievements/:userId
 *   GET    /guilds/:guildId/achievements
 */
export async function achievementRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/achievements/:userId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };

    const records = await prisma.userAchievement.findMany({
      where: { guildId, userId },
      orderBy: { earnedAt: 'asc' },
    });

    const data = records.map((r) => ({
      ...r,
      ...(ACHIEVEMENT_DEFS[r.achievementId] ?? { name: r.achievementId, description: '', emoji: '🎖️' }),
    }));

    return reply.send({ success: true, data });
  });

  server.get('/guilds/:guildId/achievements', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const counts = await prisma.userAchievement.groupBy({
      by: ['userId'],
      where: { guildId },
      _count: { achievementId: true },
      orderBy: { _count: { achievementId: 'desc' } },
      take: 10,
    });

    return reply.send({ success: true, data: counts.map((c) => ({ userId: c.userId, count: c._count.achievementId })) });
  });
}
