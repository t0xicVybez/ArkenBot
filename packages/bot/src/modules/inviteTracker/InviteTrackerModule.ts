

import type { Guild, GuildMember, PartialGuildMember } from 'discord.js';
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const inviteCache = new Map<string, Map<string, number>>();

export class InviteTrackerModule {

  static async cacheGuild(guild: Guild): Promise<void> {
    try {
      const invites = await guild.invites.fetch();
      const map = new Map<string, number>();
      for (const invite of invites.values()) {
        map.set(invite.code, invite.uses ?? 0);
      }
      inviteCache.set(guild.id, map);
    } catch {

    }
  }

  static setInvite(guildId: string, code: string, uses: number): void {
    const map = inviteCache.get(guildId) ?? new Map();
    map.set(code, uses);
    inviteCache.set(guildId, map);
  }

  static removeInvite(guildId: string, code: string): void {
    inviteCache.get(guildId)?.delete(code);
  }

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

      const newMap = new Map<string, number>();
      for (const invite of fresh.values()) newMap.set(invite.code, invite.uses ?? 0);
      inviteCache.set(member.guild.id, newMap);

      if (!inviterId) return;

      await db.inviteCount.upsert({
        where:  { guildId_userId: { guildId: member.guild.id, userId: inviterId } },
        update: { invites: { increment: 1 } },
        create: { guildId: member.guild.id, userId: inviterId, invites: 1 },
      });

      await db.inviteCount.upsert({
        where:  { guildId_userId: { guildId: member.guild.id, userId: member.id } },
        update: {},
        create: { guildId: member.guild.id, userId: member.id },
      });

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

  static async getLeaderboard(guildId: string, limit = 10) {
    return db.inviteCount.findMany({
      where:   { guildId, invites: { gt: 0 } },
      orderBy: [{ invites: 'desc' }],
      take:    limit,
    });
  }

  static async getUserCount(guildId: string, userId: string) {
    return db.inviteCount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }

  static clearGuild(guildId: string): void {
    inviteCache.delete(guildId);
  }
}
