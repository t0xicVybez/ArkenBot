/**
 * Tracks which guild members were invited by whom by comparing invite use-counts
 * before and after each member join. Invite data is kept in an in-process cache
 * and refreshed on each join event.
 */

import type { Guild, GuildMember, PartialGuildMember } from 'discord.js';
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** In-memory snapshot of invite use-counts, keyed by guildId then invite code. */
const inviteCache = new Map<string, Map<string, number>>();

export class InviteTrackerModule {
  /**
   * Fetches all active invites for a guild and stores their use-counts in the
   * local cache. Call on the `ready` event and after `inviteCreate` / `inviteDelete`
   * so the baseline is always up to date.
   */
  static async cacheGuild(guild: Guild): Promise<void> {
    try {
      const invites = await guild.invites.fetch();
      const map = new Map<string, number>();
      for (const invite of invites.values()) {
        map.set(invite.code, invite.uses ?? 0);
      }
      inviteCache.set(guild.id, map);
    } catch {
      // The bot lacks Manage Guild permission in this guild — skip silently.
    }
  }

  /** Updates the cached use-count for a single invite. Call on `inviteCreate`. */
  static setInvite(guildId: string, code: string, uses: number): void {
    const map = inviteCache.get(guildId) ?? new Map();
    map.set(code, uses);
    inviteCache.set(guildId, map);
  }

  /** Removes an invite from the local cache. Call on `inviteDelete`. */
  static removeInvite(guildId: string, code: string): void {
    inviteCache.get(guildId)?.delete(code);
  }

  /**
   * Determines which invite was used by comparing the cached use-counts against
   * a freshly fetched snapshot. Credits the inviter and refreshes the full cache.
   * The invite-on-join attribution relies on the use-count delta heuristic, which
   * can be ambiguous when multiple invites are used simultaneously.
   */
  static async handleJoin(member: GuildMember): Promise<void> {
    const settings = await getGuildSettings(member.guild.id);
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    if (!extended.inviteTrackerEnabled) return;

    try {
      const cached = inviteCache.get(member.guild.id) ?? new Map<string, number>();
      const fresh   = await member.guild.invites.fetch();

      let inviterId: string | null = null;

      for (const invite of fresh.values()) {
        const prev = cached.get(invite.code) ?? 0;
        if ((invite.uses ?? 0) > prev) {
          inviterId = invite.inviter?.id ?? null;
          cached.set(invite.code, invite.uses ?? 0);
          break;
        }
      }

      // Replace the entire cached snapshot with the fresh data.
      const newMap = new Map<string, number>();
      for (const invite of fresh.values()) newMap.set(invite.code, invite.uses ?? 0);
      inviteCache.set(member.guild.id, newMap);

      if (!inviterId) return;

      await db.inviteCount.upsert({
        where:  { guildId_userId: { guildId: member.guild.id, userId: inviterId } },
        update: { invites: { increment: 1 } },
        create: { guildId: member.guild.id, userId: inviterId, invites: 1 },
      });

      // Ensure the joining member has a row so leave-decrement logic can reference it later.
      await db.inviteCount.upsert({
        where:  { guildId_userId: { guildId: member.guild.id, userId: member.id } },
        update: {},
        create: { guildId: member.guild.id, userId: member.id },
      });

      // Record which member joined via which inviter.
      await db.inviteJoin.create({
        data: {
          guildId:        member.guild.id,
          inviterId,
          joinedUserId:   member.id,
          joinedUsername: member.user.username,
        },
      });

    } catch (err) {
      logger.error({ err }, 'InviteTrackerModule: failed to track join');
    }
  }

  /**
   * Marks the member's active InviteJoin record as left so the dashboard can
   * show which invitees have since departed.
   */
  static async handleLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    const settings = await getGuildSettings(member.guild.id);
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    if (!extended.inviteTrackerEnabled) return;

    try {
      await db.inviteJoin.updateMany({
        where:  { guildId: member.guild.id, joinedUserId: member.id, leftAt: null },
        data:   { leftAt: new Date() },
      });
    } catch (err) {
      logger.error({ err }, 'InviteTrackerModule: failed to mark leave');
    }
  }

  /**
   * Returns the top inviters for a guild, ordered by invite count descending.
   * @param limit - Maximum number of entries to return (default: 10).
   */
  static async getLeaderboard(guildId: string, limit = 10) {
    return db.inviteCount.findMany({
      where:   { guildId, invites: { gt: 0 } },
      orderBy: [{ invites: 'desc' }],
      take:    limit,
    });
  }

  /** Returns the invite count record for a specific user in a guild. */
  static async getUserCount(guildId: string, userId: string) {
    return db.inviteCount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }
}
