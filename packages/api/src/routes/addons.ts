/**
 * Routes for managing the addon registry and per-guild addon installations.
 * Guild administrators may install, uninstall, and configure addons.
 * Staff members may register and update addon definitions in the registry.
 */
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin, requireStaff } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

/**
 * Registers addon routes.
 *
 * Public/guild-scoped routes:
 *   GET    /addons                            — list available addons
 *   GET    /guilds/:guildId/addons            — list addons installed in a guild
 *   POST   /guilds/:guildId/addons/:addonId   — install an addon
 *   DELETE /guilds/:guildId/addons/:addonId   — uninstall an addon
 *   GET    /guilds/:guildId/addons/:addonId/settings  — read addon settings
 *   PATCH  /guilds/:guildId/addons/:addonId/settings  — update addon settings
 *
 * Staff-only routes:
 *   POST   /admin/addons      — register a new addon
 *   PATCH  /admin/addons/:id  — update an existing addon definition
 */
export async function addonRoutes(server: FastifyInstance): Promise<void> {
  // List available addons. Staff may pass ?all=true to include disabled addons.
  server.get('/addons', async (request, reply) => {
    const query = request.query as { all?: string };
    const showAll = query.all === 'true';
    const addons = await prisma.addon.findMany({
      where: showAll ? undefined : { enabled: true },
      orderBy: { displayName: 'asc' },
    });
    return reply.send({ success: true, data: addons });
  });

  server.get('/guilds/:guildId/addons', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const guildAddons = await prisma.guildAddon.findMany({
      where: { guildId },
      include: { addon: true },
    });

    return reply.send({ success: true, data: guildAddons });
  });

  server.post('/guilds/:guildId/addons/:addonId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, addonId } = request.params as { guildId: string; addonId: string };

    const addon = await prisma.addon.findUnique({ where: { id: addonId } });
    if (!addon) return reply.code(404).send({ success: false, error: 'Addon not found' });
    if (!addon.enabled) return reply.code(400).send({ success: false, error: 'Addon is disabled' });

    const existing = await prisma.guildAddon.findUnique({
      where: { guildId_addonId: { guildId, addonId } },
    });
    if (existing) return reply.code(409).send({ success: false, error: 'Addon already installed' });

    const guildAddon = await prisma.guildAddon.create({
      data: { guildId, addonId, enabled: true, settings: {} },
      include: { addon: true },
    });

    await pub.publish('api:events', JSON.stringify({
      type: 'addon:install',
      data: { guildId, addonName: addon.name },
    }));

    return reply.code(201).send({ success: true, data: guildAddon });
  });

  server.delete('/guilds/:guildId/addons/:addonId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, addonId } = request.params as { guildId: string; addonId: string };

    const existing = await prisma.guildAddon.findUnique({
      where: { guildId_addonId: { guildId, addonId } },
      include: { addon: true },
    });
    if (!existing) return reply.code(404).send({ success: false, error: 'Addon not installed' });

    await prisma.guildAddon.delete({ where: { guildId_addonId: { guildId, addonId } } });

    await pub.publish('api:events', JSON.stringify({
      type: 'addon:uninstall',
      data: { guildId, addonName: existing.addon.name },
    }));

    return reply.send({ success: true, message: 'Addon uninstalled' });
  });

  server.get('/guilds/:guildId/addons/:addonId/settings', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, addonId } = request.params as { guildId: string; addonId: string };

    const guildAddon = await prisma.guildAddon.findUnique({
      where: { guildId_addonId: { guildId, addonId } },
      include: { addon: true },
    });
    if (!guildAddon) return reply.code(404).send({ success: false, error: 'Addon not installed' });

    return reply.send({ success: true, data: guildAddon.settings });
  });

  server.patch('/guilds/:guildId/addons/:addonId/settings', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, addonId } = request.params as { guildId: string; addonId: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = request.body as any;

    const guildAddon = await prisma.guildAddon.update({
      where: { guildId_addonId: { guildId, addonId } },
      data: { settings },
      include: { addon: true },
    });

    await pub.publish('api:events', JSON.stringify({
      type: 'addon:settings-update',
      data: { guildId, addonName: guildAddon.addon?.name ?? addonId, settings },
    }));

    return reply.send({ success: true, data: guildAddon.settings });
  });

  // ─── Staff-only routes ────────────────────────────────────────────────────

  server.post('/admin/addons', { preHandler: [requireStaff] }, async (request, reply) => {
    const data = request.body as {
      name: string;
      displayName: string;
      version: string;
      description: string;
      author: string;
      homepage?: string;
      manifest: object;
    };

    const existing = await prisma.addon.findUnique({ where: { name: data.name } });
    if (existing) return reply.code(409).send({ success: false, error: 'Addon already exists' });

    const addon = await prisma.addon.create({ data });
    return reply.code(201).send({ success: true, data: addon });
  });

  server.patch('/admin/addons/:id', { preHandler: [requireStaff] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = request.body as Record<string, unknown>;

    const addon = await prisma.addon.update({ where: { id }, data });
    return reply.send({ success: true, data: addon });
  });
}
