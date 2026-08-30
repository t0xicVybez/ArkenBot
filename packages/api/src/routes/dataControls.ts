import type { FastifyInstance } from 'fastify';
import { requireAuth, requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

/**
 * Self-service data controls (privacy / GDPR).
 *
 *  - Server admins can permanently delete ALL of a server's data on demand
 *    (the same purge the bot runs 72h after removal, but immediate).
 *  - Any logged-in user can download or delete their own PERSONAL data across
 *    every server. Moderation records (cases, warnings, temp-bans, staff notes)
 *    are shown in the export for transparency but are NEVER deletable by the
 *    subject — they are the server's safety records, not the user's to erase.
 */

export async function dataControlsRoutes(server: FastifyInstance): Promise<void> {
  // ── DELETE /guilds/:guildId/data ──────────────────────────────────────────
  // Immediate, permanent wipe of everything stored for a server. Deleting the
  // Guild row cascades to every FK-linked model; the orphan tables below store
  // guildId as a plain column, so they are cleared explicitly (mirror of the
  // bot's utils/guildPurge.ts list — keep the two in sync).
  server.delete('/guilds/:guildId/data', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const ops = await Promise.allSettled([
      prisma.guild.deleteMany({ where: { id: guildId } }),
      prisma.addonData.deleteMany({ where: { guildId } }),
      prisma.userAchievement.deleteMany({ where: { guildId } }),
      prisma.serverDailyStats.deleteMany({ where: { guildId } }),
      prisma.reputation.deleteMany({ where: { guildId } }),
      prisma.starboardEntry.deleteMany({ where: { guildId } }),
      prisma.suggestion.deleteMany({ where: { guildId } }),
    ]);

    const failed = ops.filter((o) => o.status === 'rejected');
    if (failed.length) {
      request.log.error({ guildId, failed: failed.map((f) => String((f as PromiseRejectedResult).reason)) }, 'Server data deletion had errors');
      return reply.code(500).send({ success: false, error: 'Some data could not be deleted. Please try again.' });
    }

    // Tell the bot to drop in-memory caches for this guild (settings + invites).
    await pub.publish('api:events', JSON.stringify({ type: 'guild:reset', data: { guildId } })).catch(() => undefined);

    return reply.send({ success: true, message: 'All data for this server has been permanently deleted.' });
  });

  // ── GET /me/data-export ───────────────────────────────────────────────────
  // A machine-readable copy of everything tied to the caller's Discord ID.
  server.get('/me/data-export', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user!.id;

    const [
      levels, achievements, balances, inventory, lotteryTickets, birthdays,
      rankCard, preferences, reminders, topggVote, pollVotes, eventRsvps, inviteCounts,
      moderationCases, warnings, tempBans, staffNotes,
    ] = await Promise.all([
      prisma.userLevel.findMany({ where: { userId } }),
      prisma.userAchievement.findMany({ where: { userId } }),
      prisma.economyBalance.findMany({ where: { userId } }),
      prisma.economyInventory.findMany({ where: { userId } }),
      prisma.economyLotteryTicket.findMany({ where: { userId } }),
      prisma.birthday.findMany({ where: { userId } }),
      prisma.userRankCardStyle.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.reminder.findMany({ where: { userId } }),
      prisma.topggVoter.findUnique({ where: { userId } }),
      prisma.pollVote.findMany({ where: { userId } }),
      prisma.eventRsvp.findMany({ where: { userId } }),
      prisma.inviteCount.findMany({ where: { userId } }),
      prisma.moderationCase.findMany({ where: { userId } }),
      prisma.warning.findMany({ where: { userId } }),
      prisma.tempBan.findMany({ where: { userId } }),
      prisma.userNote.findMany({ where: { userId } }),
    ]);

    const payload = {
      format: 'arkenbot-user-data',
      version: 1,
      exportedAt: new Date().toISOString(),
      userId,
      username: request.user!.username ?? null,
      personal: {
        levels, achievements, balances, inventory, lotteryTickets, birthdays,
        rankCard, preferences, reminders, topggVote, pollVotes, eventRsvps, inviteCounts,
      },
      // Read-only: retained by servers as moderation/safety records.
      moderationRecords: { moderationCases, warnings, tempBans, staffNotes },
    };

    reply.header('Content-Disposition', 'attachment; filename="arkenbot-my-data.json"');
    return reply.send(payload);
  });

  // ── DELETE /me/data ───────────────────────────────────────────────────────
  // Erase the caller's PERSONAL records across all servers. Moderation records
  // and invite attribution (which belongs to the servers, not the subject) are
  // intentionally left intact.
  server.delete('/me/data', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user!.id;

    const results = await Promise.allSettled([
      prisma.userLevel.deleteMany({ where: { userId } }),
      prisma.userAchievement.deleteMany({ where: { userId } }),
      prisma.economyBalance.deleteMany({ where: { userId } }),
      prisma.economyInventory.deleteMany({ where: { userId } }),
      prisma.economyLotteryTicket.deleteMany({ where: { userId } }),
      prisma.birthday.deleteMany({ where: { userId } }),
      prisma.userRankCardStyle.deleteMany({ where: { userId } }),
      prisma.reminder.deleteMany({ where: { userId } }),
      prisma.topggVoter.deleteMany({ where: { userId } }),
      prisma.pollVote.deleteMany({ where: { userId } }),
      prisma.eventRsvp.deleteMany({ where: { userId } }),
      prisma.userPreferences.deleteMany({ where: { userId } }),
    ]);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      request.log.error({ userId, failed: failed.map((f) => String((f as PromiseRejectedResult).reason)) }, 'Personal data deletion had errors');
      return reply.code(500).send({ success: false, error: 'Some data could not be deleted. Please try again.' });
    }

    const deleted = results.reduce((n, r) => n + ((r as PromiseFulfilledResult<{ count: number }>).value.count ?? 0), 0);
    return reply.send({ success: true, deleted, message: 'Your personal data has been deleted.' });
  });
}
