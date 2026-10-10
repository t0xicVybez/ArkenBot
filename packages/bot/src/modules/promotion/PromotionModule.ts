/**
 * Server Promotion Tracking.
 *
 * Tracks members who promote the server via their **custom status** (containing a
 * configured keyword / invite / phrase) or by displaying the server's **Discord
 * tag** (`user.primaryGuild`). Opt-in per guild, off by default.
 *
 * Model: one open `PromotionSession` (endedAt = null) per member per kind while
 * they're visibly promoting. It closes when they remove it, go offline/invisible,
 * leave, or the sweep reconciles. Total promotion time = sum of session durations,
 * so offline/invisible gaps simply aren't counted (Discord hides custom status
 * from everyone, including bots, while a user is invisible — a known limitation).
 *
 * The hot path (`handlePresence`) bails immediately unless the guild is enabled,
 * so this very high-volume event stays cheap at scale.
 */
import { ActivityType, type Presence, type User, type Client, type Guild } from 'discord.js';
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';

type Kind = 'status' | 'tag';

interface CachedConfig {
  enabled: boolean;
  trackStatus: boolean;
  trackTag: boolean;
  keywords: string[]; // already lower-cased
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
  /** Guild IDs with promotion enabled — the hot-path gate. */
  private static enabledGuilds = new Set<string>();
  /** Per-guild config cache, kept in sync with `enabledGuilds`. */
  private static configs = new Map<string, CachedConfig>();
  private static loaded = false;

  /** (Re)load enabled guild configs into memory. Cheap; called on ready, on the
   * reconcile sweep, and on dashboard config changes (via Redis invalidation). */
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

  // ─── Aggregates (shared with the /promotion command) ────────────────────────────

  /** Total promotion seconds + live-status flags per member, ranked. */
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

  /** Single-member aggregate (null if they have never promoted). */
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

  // ─── Matching ───────────────────────────────────────────────────────────────

  /** The custom-status text, or null if the member isn't visibly showing one. */
  private static customStatusText(presence: Presence | null): string | null {
    if (!presence || presence.status === 'offline') return null; // invisible == offline to us
    const custom = presence.activities.find((a) => a.type === ActivityType.Custom);
    const text = custom?.state?.trim();
    return text && text.length > 0 ? text : null;
  }

  /** Returns the matched status text if it contains any configured keyword. */
  private static matchStatus(text: string | null, keywords: string[]): string | null {
    if (!text || keywords.length === 0) return null;
    const hay = text.toLowerCase();
    return keywords.some((k) => hay.includes(k)) ? text : null;
  }

  /** Whether `user` currently displays `guildId`'s server tag. */
  private static matchTag(user: User | null, guildId: string): string | null {
    const pg = user?.primaryGuild;
    if (pg && pg.identityEnabled && pg.identityGuildId === guildId) {
      return pg.tag ?? '(tag)';
    }
    return null;
  }

  // ─── Session helpers ──────────────────────────────────────────────────────────

  /** Open a session if none is active for this (guild, user, kind). No-op if one
   * is already open (keeps the original startedAt so duration stays continuous). */
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

  /** Close the active session (if any) for this (guild, user, kind). */
  private static async closeSession(guildId: string, userId: string, kind: Kind, reason: string): Promise<void> {
    await prisma.promotionSession.updateMany({
      where: { guildId, userId, kind, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    });
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  /** presenceUpdate — custom-status tracking. Hot path: bails unless enabled. */
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
      // No visible matching status: offline/invisible vs removed, recorded distinctly.
      const reason = !next || next.status === 'offline' ? 'offline' : 'removed';
      await this.closeSession(guildId, userId, 'status', reason);
    }
  }

  /** userUpdate — server-tag tracking. A user's primaryGuild is global, so we act
   * on the guild they now display and the one they stopped displaying. */
  static async handleUserUpdate(oldUser: User | null, newUser: User): Promise<void> {
    if (newUser.bot) return;
    const oldId = oldUser?.primaryGuild?.identityEnabled ? oldUser.primaryGuild.identityGuildId : null;
    const newId = newUser.primaryGuild?.identityEnabled ? newUser.primaryGuild.identityGuildId : null;
    if (oldId === newId) return; // tag unchanged — ignore (userUpdate fires for many reasons)

    // Stopped displaying a tag we track → close.
    if (oldId && oldId !== newId && this.configs.get(oldId)?.trackTag) {
      await this.closeSession(oldId, newUser.id, 'tag', 'removed');
    }
    // Now displaying a tag we track → open (only if they're a member of it).
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

  /** guildMemberRemove — close any open sessions when a member leaves. */
  static async handleMemberRemove(guildId: string, userId: string): Promise<void> {
    if (!this.enabledGuilds.has(guildId)) return;
    await prisma.promotionSession.updateMany({
      where: { guildId, userId, endedAt: null },
      data: { endedAt: new Date(), endReason: 'left' },
    });
  }

  // ─── Reconciliation sweep ──────────────────────────────────────────────────────

  /**
   * Periodic backstop: reconcile DB sessions against what's actually visible, so
   * missed gateway events (restarts, invisibility, tag changes) don't drift.
   * For each enabled guild, walk cached members and open/close to match reality.
   */
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
    // Current visible truth, keyed by `${userId}:${kind}` → matched value + identity.
    type Truth = { value: string; username: string; avatar: string | null };
    const activeTruth = new Map<string, Truth>();
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const id = { username: member.user.username, avatar: member.user.avatar };
      if (cfg.trackStatus) {
        const m = this.matchStatus(this.customStatusText(member.presence), cfg.keywords);
        if (m) activeTruth.set(`${member.id}:status`, { value: m, ...id });
      }
      if (cfg.trackTag) {
        const m = this.matchTag(member.user, guildId);
        if (m) activeTruth.set(`${member.id}:tag`, { value: m, ...id });
      }
    }

    // Open sessions the DB thinks are active.
    const open = await prisma.promotionSession.findMany({
      where: { guildId, endedAt: null },
      select: { id: true, userId: true, kind: true },
    });
    const openKeys = new Set<string>();
    const toClose: string[] = [];
    for (const s of open) {
      const key = `${s.userId}:${s.kind}`;
      openKeys.add(key);
      if (!activeTruth.has(key)) toClose.push(s.id); // no longer visibly promoting
    }
    if (toClose.length > 0) {
      await prisma.promotionSession.updateMany({
        where: { id: { in: toClose } },
        data: { endedAt: new Date(), endReason: 'reconcile' },
      });
    }

    // Anything visibly promoting but with no open session → open it.
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
