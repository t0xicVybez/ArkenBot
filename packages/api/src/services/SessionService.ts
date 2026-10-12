/**
 * The database-backed session store that authenticates dashboard requests — create, look up, refresh and revoke sessions tied to the auth cookie.
 */
import { randomBytes } from 'crypto';
import { prisma } from '../database.js';
import { config } from '../config.js';
import { sha256 } from '../utils/crypto.js';
import { logger } from '../logger.js';

export interface SessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface ResolvedSession {
  userId: string;
  sessionId: string;

  newSid?: string;
}

function newSid(): string {
  return randomBytes(32).toString('base64url');
}

export class SessionService {

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

  static async revoke(sid: string): Promise<void> {
    const hash = sha256(sid);
    await prisma.userSession.updateMany({
      where: { OR: [{ tokenHash: hash }, { previousHash: hash }], revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  static async revokeFamily(familyId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  static async revokeAllForUser(userId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  static async revokeById(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.userSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  static async list(userId: string): Promise<
    Array<{ id: string; userAgent: string | null; ipAddress: string | null; lastUsedAt: Date; createdAt: Date }>
  > {
    return prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true, createdAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  static async cleanupExpired(): Promise<void> {
    const revokedCutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const { count } = await prisma.userSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: revokedCutoff } }],
      },
    });
    if (count > 0) {
      logger.info({ count }, 'SessionService: cleaned up expired/revoked sessions');
    }
  }
}

function metaUpdate(meta: SessionMeta): { userAgent?: string; ipAddress?: string } {
  const update: { userAgent?: string; ipAddress?: string } = {};
  if (meta.userAgent) update.userAgent = meta.userAgent;
  if (meta.ipAddress) update.ipAddress = meta.ipAddress;
  return update;
}
