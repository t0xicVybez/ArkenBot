import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TEST_DB_URL } from '../helpers/testDb.js';

// Point the API's Prisma singleton at the test database BEFORE the server (and
// its database module) are imported. Gated on TEST_DATABASE_URL so CI, which
// has no database, skips the whole file.
if (TEST_DB_URL) process.env.DATABASE_URL = TEST_DB_URL;

// Minimal shapes for the bits of the dynamically-imported modules we use.
type App = { inject: (o: unknown) => Promise<{ statusCode: number; json: () => unknown }>; ready: () => Promise<void>; close: () => Promise<void> };

const GUILD = '900000000000000001';
const OTHER_GUILD = '900000000000000009';
const STAFF = '900000000000000002';

describe.skipIf(!TEST_DB_URL)('settings + personalization routes (inject, arkenbot_test)', () => {
  let app: App;
  let prisma: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let cookieName: string;
  let sid: string;

  const authed = (method: string, url: string, payload?: unknown) =>
    app.inject({ method, url, payload, cookies: { [cookieName]: sid } });

  beforeAll(async () => {
    const [{ createServer }, { prisma: p }, { SessionService }, { config }] = await Promise.all([
      import('../../packages/api/src/server.js'),
      import('../../packages/api/src/database.js'),
      import('../../packages/api/src/services/SessionService.js'),
      import('../../packages/api/src/config.js'),
    ]);
    prisma = p;
    cookieName = config.cookie.name;
    app = (await createServer()) as unknown as App;
    await app.ready();

    // Seed two guilds (with settings rows), a staff user, and that user's session.
    // A staff user bypasses requireGuildAdmin's Discord permission check, and
    // ensureGuildRow finds the seeded rows (so no real Discord call is made).
    for (const id of [GUILD, OTHER_GUILD]) {
      await prisma.guild.upsert({ where: { id }, update: {}, create: { id, name: `Test ${id}`, ownerId: STAFF, settings: { create: {} } } });
    }
    await prisma.portalUser.upsert({ where: { id: STAFF }, update: { isStaff: true }, create: { id: STAFF, username: 'staff', isStaff: true } });
    sid = await SessionService.create(STAFF);
  });

  afterAll(async () => {
    try {
      await prisma.userSession.deleteMany({ where: { userId: STAFF } });
      await prisma.guildEmbed.deleteMany({ where: { guildId: { in: [GUILD, OTHER_GUILD] } } });
      await prisma.guild.deleteMany({ where: { id: { in: [GUILD, OTHER_GUILD] } } });
      await prisma.portalUser.deleteMany({ where: { id: STAFF } });
    } catch { /* best-effort cleanup */ }
    await app?.close();
  });

  it('rejects an unauthenticated request (401)', async () => {
    const r = await app.inject({ method: 'PATCH', url: `/guilds/${GUILD}/settings`, payload: { levelingEnabled: true } });
    expect(r.statusCode).toBe(401);
  });

  it('saves a full leveling payload — the bug that broke the leveling page (200)', async () => {
    const r = await authed('PATCH', `/guilds/${GUILD}/settings`, {
      xpPerMessage: 50, xpCooldown: 30, levelUpMessage: 'gg {user}', levelUpEmbed: false,
      keepPreviousRoles: true, xpDecayEnabled: true, xpDecayDays: 30, xpDecayPercent: 5,
    });
    expect(r.statusCode).toBe(200);
    const saved = await prisma.guildSettings.findUnique({ where: { guildId: GUILD } });
    expect(saved.xpPerMessage).toBe(50);
    expect(saved.xpDecayEnabled).toBe(true);
  });

  it('rejects an unknown settings key with 400 (strict schema)', async () => {
    const r = await authed('PATCH', `/guilds/${GUILD}/settings`, { notARealField: 123 });
    expect(r.statusCode).toBe(400);
  });

  it('accepts a bot-avatar data URI on the personalization route', async () => {
    const r = await authed('PATCH', `/guilds/${GUILD}/personalization`, {
      botAvatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      nickname: 'ArkenTest',
    });
    expect(r.statusCode).toBe(200);
  });

  it('enforces guild scoping on by-id writes (IDOR → 404)', async () => {
    const embed = await prisma.guildEmbed.create({ data: { guildId: GUILD, name: 'idor-test' } });
    // Delete it through a DIFFERENT guild the staff user also "manages": the
    // findFirst({ id, guildId }) guard must miss and 404, not cross guilds.
    const cross = await authed('DELETE', `/guilds/${OTHER_GUILD}/embeds/${embed.id}`);
    expect(cross.statusCode).toBe(404);
    // Correct guild deletes it.
    const ok = await authed('DELETE', `/guilds/${GUILD}/embeds/${embed.id}`);
    expect(ok.statusCode).toBe(200);
  });
});
