
import { ActivityType, type Presence, type User, type Client, type Guild } from 'discord.js';
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';

type Kind = 'status' | 'tag';

interface CachedConfig {
  enabled: boolean;
  trackStatus: boolean;
  trackTag: boolean;
  keywords: string[];
}

export interface PromoAggregate {
  userId: string;
  username: string | null;
  status_seconds: number;
  tag_seconds: number;
  status_active: boolean | null;
  tag_active: boolean | null;
}

export class PromotionModule {

  private static enabledGuilds = new Set<string>();

  private static configs = new Map<string, CachedConfig>();
  private static loaded = false;

  static async refresh(): Promise<void> {
    try {
      const rows = await prisma.promotionConfig.findMany({ where: { enabled: true } });
      const next = new Map<string, CachedConfig>();
      const set = new Set<string>();
      for (const r of rows) {
        set.add(r.guildId);
        next.set(r.guildId, {
          enabled: true,
          trackStatus: r.trackStatus,
          trackTag: r.trackTag,
          keywords: (r.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean),
        });
      }
      this.enabledGuilds = set;
      this.configs = next;
      this.loaded = true;
    } catch (err) {
      logger.error({ err }, 'PromotionModule.refresh failed');
    }
  }

  static isEnabled(guildId: string): boolean {
    return this.enabledGuilds.has(guildId);
  }

  static async getLeaderboard(guildId: string, limit = 10): Promise<PromoAggregate[]> {
    return prisma.$queryRaw<PromoAggregate[]>`
      SELECT * FROM (
        SELECT
          "userId",
          (array_agg("username" ORDER BY "startedAt" DESC))[1] AS username,
          COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'status'), 0)::float8 AS status_seconds,
          COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'tag'), 0)::float8 AS tag_seconds,
          BOOL_OR("endedAt" IS NULL AND kind = 'status') AS status_active,
          BOOL_OR("endedAt" IS NULL AND kind = 'tag') AS tag_active
        FROM promotion_sessions
        WHERE "guildId" = ${guildId}
        GROUP BY "userId"
      ) t
      ORDER BY (t.status_seconds + t.tag_seconds) DESC
      LIMIT ${Math.min(Math.max(limit, 1), 25)}`;
  }

  static async getSummary(guildId: string, userId: string): Promise<PromoAggregate | null> {
    const rows = await prisma.$queryRaw<PromoAggregate[]>`
      SELECT
        "userId",
        (array_agg("username" ORDER BY "startedAt" DESC))[1] AS username,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'status'), 0)::float8 AS status_seconds,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'tag'), 0)::float8 AS tag_seconds,
        BOOL_OR("endedAt" IS NULL AND kind = 'status') AS status_active,
        BOOL_OR("endedAt" IS NULL AND kind = 'tag') AS tag_active
      FROM promotion_sessions
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      GROUP BY "userId"`;
    return rows[0] ?? null;
  }

  private static customStatusText(presence: Presence | null): string | null {
    if (!presence || presence.status === 'offline') return null;
    const custom = presence.activities.find((a) => a.type === ActivityType.Custom);
    const text = custom?.state?.trim();
    return text && text.length > 0 ? text : null;
  }

  private static matchStatus(text: string | null, keywords: string[]): string | null {
    if (!text || keywords.length === 0) return null;
    const hay = text.toLowerCase();
    return keywords.some((k) => hay.includes(k)) ? text : null;
  }

  private static matchTag(user: User | null, guildId: string): string | null {
    const pg = user?.primaryGuild;
    if (pg && pg.identityEnabled && pg.identityGuildId === guildId) {
      return pg.tag ?? '(tag)';
    }
    return null;
  }

  private static async openSession(
    guildId: string,
    userId: string,
    kind: Kind,
    value: string | null,
    user?: { username: string; avatar: string | null } | null,
  ): Promise<void> {
    const active = await prisma.promotionSession.findFirst({
      where: { guildId, userId, kind, endedAt: null },
      select: { id: true },
    });
    if (active) return;
    await prisma.promotionSession.create({
      data: { guildId, userId, kind, value, username: user?.username, avatar: user?.avatar ?? null },
    });
  }

  private static async closeSession(guildId: string, userId: string, kind: Kind, reason: string): Promise<void> {
    await prisma.promotionSession.updateMany({
      where: { guildId, userId, kind, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    });
  }

  static async handlePresence(_old: Presence | null, next: Presence | null): Promise<void> {
    const guildId = next?.guild?.id;
    if (!guildId || !this.enabledGuilds.has(guildId)) return;
    const cfg = this.configs.get(guildId);
    if (!cfg?.trackStatus) return;
    const userId = next?.userId;
    if (!userId || next?.user?.bot) return;

    const matched = this.matchStatus(this.customStatusText(next), cfg.keywords);
    if (matched) {
      const u = next?.user ? { username: next.user.username, avatar: next.user.avatar } : null;
      await this.openSession(guildId, userId, 'status', matched, u);
    } else {

      const reason = !next || next.status === 'offline' ? 'offline' : 'removed';
      await this.closeSession(guildId, userId, 'status', reason);
    }
  }

  static async handleUserUpdate(oldUser: User | null, newUser: User): Promise<void> {
    if (newUser.bot) return;
    const oldId = oldUser?.primaryGuild?.identityEnabled ? oldUser.primaryGuild.identityGuildId : null;
    const newId = newUser.primaryGuild?.identityEnabled ? newUser.primaryGuild.identityGuildId : null;
    if (oldId === newId) return;

    if (oldId && oldId !== newId && this.configs.get(oldId)?.trackTag) {
      await this.closeSession(oldId, newUser.id, 'tag', 'removed');
    }

    if (newId && this.configs.get(newId)?.trackTag) {
      const guild = newUser.client.guilds.cache.get(newId);
      const isMember = guild ? guild.members.cache.has(newUser.id) || (await guild.members.fetch(newUser.id).then(() => true).catch(() => false)) : false;
      if (isMember) {
        await this.openSession(newId, newUser.id, 'tag', this.matchTag(newUser, newId), {
          username: newUser.username,
          avatar: newUser.avatar,
        });
      }
    }
  }

  static async handleMessage(guildId: string, author: User): Promise<void> {
    if (author.bot || !this.enabledGuilds.has(guildId)) return;
    if (!this.configs.get(guildId)?.trackTag) return;
    const tag = this.matchTag(author, guildId);
    if (tag) await this.openSession(guildId, author.id, 'tag', tag, { username: author.username, avatar: author.avatar });
  }

  static async handleMemberRemove(guildId: string, userId: string): Promise<void> {
    if (!this.enabledGuilds.has(guildId)) return;
    await prisma.promotionSession.updateMany({
      where: { guildId, userId, endedAt: null },
      data: { endedAt: new Date(), endReason: 'left' },
    });
  }

  static async reconcile(client: Client): Promise<void> {
    await this.refresh();
    for (const guildId of this.enabledGuilds) {
      const cfg = this.configs.get(guildId);
      const guild = client.guilds.cache.get(guildId);
      if (!cfg || !guild) continue;
      try {
        await this.reconcileGuild(guild, cfg);
      } catch (err) {
        logger.warn({ err, guildId }, 'promotion reconcile (guild) failed');
      }
    }
  }

  private static async reconcileGuild(guild: Guild, cfg: CachedConfig): Promise<void> {
    const guildId = guild.id;
    type Truth = { value: string; username: string; avatar: string | null };
    const activeTruth = new Map<string, Truth>();

    if (cfg.trackStatus) {
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        const m = this.matchStatus(this.customStatusText(member.presence), cfg.keywords);
        if (m) activeTruth.set(`${member.id}:status`, { value: m, username: member.user.username, avatar: member.user.avatar });
      }
    }

    const open = await prisma.promotionSession.findMany({
      where: { guildId, endedAt: null },
      select: { id: true, userId: true, kind: true },
    });

    if (cfg.trackTag) {
      const TAG_FETCH_CAP = 60;
      const candidates = new Set<string>(open.filter((s) => s.kind === 'tag').map((s) => s.userId));
      for (const member of guild.members.cache.values()) {
        if (candidates.size >= TAG_FETCH_CAP) break;
        if (member.user.bot || candidates.has(member.id)) continue;
        if (member.presence && member.presence.status !== 'offline') candidates.add(member.id);
      }
      for (const userId of candidates) {
        const user = await guild.client.users.fetch(userId, { force: true }).catch(() => null);
        if (!user) continue;
        const m = this.matchTag(user, guildId);
        if (m) activeTruth.set(`${userId}:tag`, { value: m, username: user.username, avatar: user.avatar });
      }
    }
    const openKeys = new Set<string>();
    const toClose: string[] = [];
    for (const s of open) {
      const key = `${s.userId}:${s.kind}`;
      openKeys.add(key);
      if (!activeTruth.has(key)) toClose.push(s.id);
    }
    if (toClose.length > 0) {
      await prisma.promotionSession.updateMany({
        where: { id: { in: toClose } },
        data: { endedAt: new Date(), endReason: 'reconcile' },
      });
    }

    const toOpen = [...activeTruth.entries()].filter(([key]) => !openKeys.has(key));
    if (toOpen.length > 0) {
      await prisma.promotionSession.createMany({
        data: toOpen.map(([key, t]) => {
          const [userId, kind] = key.split(':');
          return { guildId, userId, kind: kind as Kind, value: t.value, username: t.username, avatar: t.avatar };
        }),
      });
    }
  }
}
