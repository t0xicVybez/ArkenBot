/**
 * Opaque server-side session lifecycle for the dashboard.
 *
 * The browser never holds a JWT — only an httpOnly cookie carrying a random,
 * opaque session id. Only its SHA-256 hash is stored, so a database leak cannot
 * be replayed as a live session. Sessions rotate their id periodically; the
 * previous hash is retained for a short grace window so a replayed (rotated-away)
 * id is detected as theft and the whole session family is revoked.
 */
import { randomBytes } from 'crypto';
import { prisma } from '../database.js';
import { config } from '../config.js';
import { sha256 } from '../utils/crypto.js';

/** Metadata captured for the active-sessions view and audit. */
export interface SessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Result of resolving a session id: the owning user, and a rotated id to re-set as the cookie. */
export interface ResolvedSession {
  userId: string;
  sessionId: string;
  /** Present when the id was rotated this request — the caller must update the cookie. */
  newSid?: string;
}

/** Generates a fresh opaque session id (43-char base64url, 256 bits of entropy). */
function newSid(): string {
  return randomBytes(32).toString('base64url');
}

export class SessionService {
  /**
   * Creates a new session for the user and returns the raw opaque id. The caller
   * is responsible for setting it as the httpOnly cookie — it is never persisted
   * in raw form.
   */
  static async create(userId: string, meta: SessionMeta = {}): Promise<string> {
    const sid = newSid();
    const now = new Date();

    await prisma.userSession.create({
      data: {
        userId,
        tokenHash: sha256(sid),
        familyId: randomBytes(16).toString('hex'),
        expiresAt: new Date(now.getTime() + config.session.idleExpiryMs),
        rotatedAt: now,
        lastUsedAt: now,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return sid;
  }

  /**
   * Validates an incoming session id and applies sliding expiry and periodic
   * rotation. Returns `null` for unknown, expired, revoked, or replayed ids.
   *
   * Reuse detection: if the id matches a session's `previousHash` beyond the
   * rotation grace window, the id was rotated away and is being replayed —
   * treated as theft, and the entire family is revoked.
   */
  static async resolve(
    sid: string,
    meta: SessionMeta = {},
    opts: { rotate?: boolean } = {}
  ): Promise<ResolvedSession | null> {
    const rotate = opts.rotate ?? true;
    const hash = sha256(sid);
    const now = new Date();

    const session = await prisma.userSession.findUnique({ where: { tokenHash: hash } });
    if (session) {
      if (session.revokedAt || session.expiresAt < now) return null;

      // Slide the idle timeout forward, capped by the absolute lifetime.
      const absoluteCap = session.createdAt.getTime() + config.session.absoluteExpiryMs;
      const slidExpiry = new Date(Math.min(now.getTime() + config.session.idleExpiryMs, absoluteCap));

      const shouldRotate =
        rotate && now.getTime() - session.rotatedAt.getTime() > config.session.rotateAfterMs;
      if (shouldRotate) {
        const nextSid = newSid();
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            previousHash: session.tokenHash,
            tokenHash: sha256(nextSid),
            rotatedAt: now,
            lastUsedAt: now,
            expiresAt: slidExpiry,
            ...metaUpdate(meta),
          },
        });
        return { userId: session.userId, sessionId: session.id, newSid: nextSid };
      }

      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: slidExpiry },
      });
      return { userId: session.userId, sessionId: session.id };
    }

    // The id matches a just-rotated token. Within the grace window this is a
    // benign in-flight request that raced the cookie update, so accept it
    // without re-rotating. Past the window it is a replay → revoke the family.
    const rotated = await prisma.userSession.findUnique({ where: { previousHash: hash } });
    if (!rotated) return null;
    if (rotated.revokedAt || rotated.expiresAt < now) return null;

    const withinGrace = now.getTime() - rotated.rotatedAt.getTime() <= config.session.graceMs;
    if (withinGrace) {
      return { userId: rotated.userId, sessionId: rotated.id };
    }

    await this.revokeFamily(rotated.familyId);
    return null;
  }

  /** Revokes the session identified by the given raw id (used at logout). */
  static async revoke(sid: string): Promise<void> {
    const hash = sha256(sid);
    await prisma.userSession.updateMany({
      where: { OR: [{ tokenHash: hash }, { previousHash: hash }], revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every session in a family — the reuse-detection response to a replay. */
  static async revokeFamily(familyId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes all of a user's sessions ("log out everywhere"). */
  static async revokeAllForUser(userId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes a single session by its database id, scoped to the owning user. */
  static async revokeById(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.userSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  /** Lists a user's active (non-revoked, non-expired) sessions for the sessions view. */
  static async list(userId: string): Promise<
    Array<{ id: string; userAgent: string | null; ipAddress: string | null; lastUsedAt: Date; createdAt: Date }>
  > {
    return prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true, createdAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /** Removes expired and long-revoked sessions. Called once at API startup. */
  static async cleanupExpired(): Promise<void> {
    const revokedCutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const { count } = await prisma.userSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: revokedCutoff } }],
      },
    });
    if (count > 0) {
      console.info(`[SessionService] Cleaned up ${count} expired/revoked session(s)`);
    }
  }
}

/** Builds a partial update that refreshes session metadata only when provided. */
function metaUpdate(meta: SessionMeta): { userAgent?: string; ipAddress?: string } {
  const update: { userAgent?: string; ipAddress?: string } = {};
  if (meta.userAgent) update.userAgent = meta.userAgent;
  if (meta.ipAddress) update.ipAddress = meta.ipAddress;
  return update;
}
