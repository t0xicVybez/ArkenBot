import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { SettingsService } from '../services/SettingsService.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

const autoModAction = z.enum(['delete', 'warn', 'mute', 'kick', 'ban']);

const GuildSettingsPatchSchema = z.object({
  prefix:               z.string().min(1).max(5).optional(),
  locale:               z.string().max(10).optional(),
  timezone:             z.string().max(50).optional(),
  moderationEnabled:    z.boolean().optional(),
  autoModEnabled:       z.boolean().optional(),
  levelingEnabled:      z.boolean().optional(),
  welcomeEnabled:       z.boolean().optional(),
  loggingEnabled:       z.boolean().optional(),
  musicEnabled:         z.boolean().optional(),
  reactionRolesEnabled: z.boolean().optional(),
  logChannelId:         z.string().nullable().optional(),
  modLogChannelId:      z.string().nullable().optional(),
  welcomeChannelId:     z.string().nullable().optional(),
  leaveChannelId:       z.string().nullable().optional(),
  levelUpChannelId:     z.string().nullable().optional(),
  muteRoleId:           z.string().nullable().optional(),
  autoRoleId:           z.string().nullable().optional(),
  memberRoleId:         z.string().nullable().optional(),
  accentColor:          z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  musicColor:           z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  levelUpColor:         z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  giveawayColor:        z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  birthdayColor:        z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  starboardColor:       z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  moderationColor:      z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  reactionRolesColor:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  streamAlertColor:         z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  scheduledMessageColor:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  loggingColor:             z.string().regex(/^(#[0-9A-Fa-f]{6}|)$/).optional(),
  announcementColor:        z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
}).strict();

const AutoModPatchSchema = z.object({
  antiSpamEnabled:         z.boolean().optional(),
  antiSpamThreshold:       z.number().int().min(2).max(50).optional(),
  antiSpamInterval:        z.number().int().min(1000).max(60000).optional(),
  antiSpamAction:          autoModAction.optional(),
  filterEnabled:           z.boolean().optional(),
  filteredWords:           z.array(z.string().max(100)).max(200).optional(),
  filterAction:            autoModAction.optional(),
  filterWarnBeforeTimeout: z.number().int().min(1).optional(),
  filterTimeoutDuration:   z.number().int().min(10).max(2419200).optional(),
  filterWarnBeforeKick:    z.number().int().min(1).optional(),
  filterWarnMessage:       z.string().max(500).optional(),
  filterKickMessage:       z.string().max(500).optional(),
  filterKickDMMessage:     z.string().max(500).optional(),
  antiLinkEnabled:         z.boolean().optional(),
  allowedDomains:          z.array(z.string().max(253)).max(50).optional(),
  linkAction:              autoModAction.optional(),
  antiMentionEnabled:      z.boolean().optional(),
  mentionThreshold:        z.number().int().min(1).max(50).optional(),
  antiCapsEnabled:         z.boolean().optional(),
  capsThreshold:           z.number().int().min(10).max(100).optional(),
  antiRaidEnabled:         z.boolean().optional(),
  raidThreshold:           z.number().int().min(2).max(100).optional(),
  raidInterval:            z.number().int().min(1000).max(30000).optional(),
  raidAction:              z.enum(['kick', 'lockdown']).optional(),
  exemptRoles:             z.array(z.string()).max(25).optional(),
  exemptChannels:          z.array(z.string()).max(50).optional(),
}).strict();

const WelcomePatchSchema = z.object({
  welcomeEnabled:   z.boolean().optional(),
  welcomeChannelId: z.string().nullable().optional(),
  welcomeMessage:   z.string().max(2000).optional(),
  welcomeEmbed:     z.boolean().optional(),
  welcomeColor:     z.string().max(7).optional(),
  welcomeDMEnabled: z.boolean().optional(),
  welcomeDMMessage: z.string().max(2000).optional(),
  leaveEnabled:     z.boolean().optional(),
  leaveChannelId:   z.string().nullable().optional(),
  leaveMessage:     z.string().max(2000).optional(),
}).strict();

/**
 * Normalise an emoji string to the canonical form used by Discord.js reaction events:
 *   - Custom emoji <:name:id> or <a:name:id>  → "name:id"
 *   - Unicode emoji (possibly with FE0F variation selector) → stripped Unicode character
 */
function normalizeEmoji(raw: string): string {
  const m = raw.match(/^<a?:([\w~]+):(\d+)>$/);
  if (m) return `${m[1]}:${m[2]}`;
  // Strip all Unicode variation selectors (U+FE00–U+FE0F, U+E0100–U+E01EF)
  // and keycap combining enclosing mark (U+20E3)
  return raw
    .replace(/[\uFE00-\uFE0F\u20E3]/g, '')
    .replace(/\uDB40[\uDC00-\uDCFF]/g, '') // U+E0100–U+E01EF (surrogate pair range)
    .trim();
}

export async function settingsRoutes(server: FastifyInstance): Promise<void> {
  // GET /guilds/:guildId/settings
  server.get('/guilds/:guildId/settings', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const settings = await SettingsService.getGuildSettings(guildId);
    if (!settings) {
      return reply.code(404).send({ success: false, error: 'Settings not found' });
    }
    return reply.send({ success: true, data: settings });
  });

  // PATCH /guilds/:guildId/settings
  server.patch('/guilds/:guildId/settings', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = GuildSettingsPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Validation error', details: parsed.error.flatten() });
    }
    const updated = await SettingsService.updateGuildSettings(guildId, parsed.data as unknown as import('@arkenbot/shared').GuildSettings);
    return reply.send({ success: true, data: updated });
  });

  // GET /guilds/:guildId/settings/automod
  server.get('/guilds/:guildId/settings/automod', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await SettingsService.getAutoModConfig(guildId);
    return reply.send({ success: true, data: config ?? {} });
  });

  // PATCH /guilds/:guildId/settings/automod
  server.patch('/guilds/:guildId/settings/automod', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = AutoModPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Validation error', details: parsed.error.flatten() });
    }
    const updated = await SettingsService.updateAutoModConfig(guildId, parsed.data);
    return reply.send({ success: true, data: updated });
  });

  // GET /guilds/:guildId/settings/welcome
  server.get('/guilds/:guildId/settings/welcome', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await SettingsService.getWelcomeConfig(guildId);
    return reply.send({ success: true, data: config ?? {} });
  });

  // PATCH /guilds/:guildId/settings/welcome
  server.patch('/guilds/:guildId/settings/welcome', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = WelcomePatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Validation error', details: parsed.error.flatten() });
    }
    const updated = await SettingsService.updateWelcomeConfig(guildId, parsed.data as unknown as import('@arkenbot/shared').WelcomeConfig);
    return reply.send({ success: true, data: updated });
  });

  // GET /guilds/:guildId/settings/announcements
  server.get('/guilds/:guildId/settings/announcements', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const settings = await prisma.guildSettings.findUnique({
      where: { guildId },
      select: { announcementsEnabled: true, announcementChannelId: true },
    });
    return reply.send({ success: true, data: settings ?? { announcementsEnabled: false, announcementChannelId: null } });
  });

  // PATCH /guilds/:guildId/settings/announcements
  server.patch('/guilds/:guildId/settings/announcements', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { announcementsEnabled, announcementChannelId } = request.body as {
      announcementsEnabled?: boolean;
      announcementChannelId?: string | null;
    };

    const updated = await prisma.guildSettings.upsert({
      where: { guildId },
      update: {
        ...(announcementsEnabled !== undefined && { announcementsEnabled }),
        ...(announcementChannelId !== undefined && { announcementChannelId: announcementChannelId || null }),
      },
      create: {
        guildId,
        ...(announcementsEnabled !== undefined && { announcementsEnabled }),
        ...(announcementChannelId !== undefined && { announcementChannelId: announcementChannelId || null }),
      },
      select: { announcementsEnabled: true, announcementChannelId: true },
    });

    return reply.send({ success: true, data: updated });
  });

  // GET /guilds/:guildId/reaction-roles
  server.get('/guilds/:guildId/reaction-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const roles = await prisma.reactionRole.findMany({ where: { guildId } });
    return reply.send({ success: true, data: roles });
  });

  // POST /guilds/:guildId/reaction-roles
  server.post('/guilds/:guildId/reaction-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, messageId, emoji, roleId, type } = request.body as {
      channelId: string;
      messageId: string;
      emoji: string;
      roleId: string;
      type: 'toggle' | 'add' | 'remove';
    };

    const role = await prisma.reactionRole.create({
      data: { guildId, channelId, messageId, emoji: normalizeEmoji(emoji), roleId, type: type ?? 'toggle' },
    });

    return reply.code(201).send({ success: true, data: role });
  });

  // DELETE /guilds/:guildId/reaction-roles/:id
  server.delete('/guilds/:guildId/reaction-roles/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };

    const existing = await prisma.reactionRole.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Reaction role not found' });

    await prisma.reactionRole.delete({ where: { id } });
    return reply.send({ success: true, message: 'Deleted' });
  });

  // ── Reaction Role Panels ─────────────────────────────────────────

  // GET /guilds/:guildId/reaction-roles/panels
  server.get('/guilds/:guildId/reaction-roles/panels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const panels = await prisma.reactionRolePanel.findMany({
      where: { guildId },
      include: { roles: true },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send({ success: true, data: panels });
  });

  // POST /guilds/:guildId/reaction-roles/panels
  server.post('/guilds/:guildId/reaction-roles/panels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, title, description } = request.body as {
      channelId: string;
      title?: string;
      description?: string;
    };

    const panel = await prisma.reactionRolePanel.create({
      data: {
        guildId,
        channelId,
        title: title ?? '🎭 Self-Roles',
        description: description ?? 'React below to assign yourself a role.',
      },
      include: { roles: true },
    });

    await pub.publish('api:events', JSON.stringify({ type: 'reaction-role:panel-upsert', data: { panelId: panel.id } }));
    return reply.code(201).send({ success: true, data: panel });
  });

  // PATCH /guilds/:guildId/reaction-roles/panels/:panelId
  server.patch('/guilds/:guildId/reaction-roles/panels/:panelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const { title, description } = request.body as { title?: string; description?: string };

    const existing = await prisma.reactionRolePanel.findFirst({ where: { id: panelId, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Panel not found' });

    const updated = await prisma.reactionRolePanel.update({
      where: { id: panelId },
      data: { ...(title !== undefined && { title }), ...(description !== undefined && { description }) },
      include: { roles: true },
    });

    await pub.publish('api:events', JSON.stringify({ type: 'reaction-role:panel-upsert', data: { panelId } }));
    return reply.send({ success: true, data: updated });
  });

  // DELETE /guilds/:guildId/reaction-roles/panels/:panelId
  server.delete('/guilds/:guildId/reaction-roles/panels/:panelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };

    const existing = await prisma.reactionRolePanel.findFirst({ where: { id: panelId, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Panel not found' });

    // Notify bot to delete the Discord message before removing from DB
    await pub.publish('api:events', JSON.stringify({
      type: 'reaction-role:panel-delete',
      data: { guildId, channelId: existing.channelId, messageId: existing.messageId },
    }));

    await prisma.reactionRolePanel.delete({ where: { id: panelId } });
    return reply.send({ success: true, message: 'Deleted' });
  });

  // POST /guilds/:guildId/reaction-roles/panels/:panelId/roles
  server.post('/guilds/:guildId/reaction-roles/panels/:panelId/roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const { emoji, roleId, type } = request.body as { emoji: string; roleId: string; type?: string };

    const panel = await prisma.reactionRolePanel.findFirst({ where: { id: panelId, guildId } });
    if (!panel) return reply.code(404).send({ success: false, error: 'Panel not found' });

    // Use the panel's current messageId if deployed, else use panelId as placeholder
    const placeholderMsgId = panel.messageId ?? panelId;

    const role = await prisma.reactionRole.create({
      data: {
        guildId,
        channelId: panel.channelId,
        messageId: placeholderMsgId,
        emoji: normalizeEmoji(emoji),
        roleId,
        type: type ?? 'toggle',
        panelId,
      },
    });

    await pub.publish('api:events', JSON.stringify({ type: 'reaction-role:panel-upsert', data: { panelId } }));
    return reply.code(201).send({ success: true, data: role });
  });

  // DELETE /guilds/:guildId/reaction-roles/panels/:panelId/roles/:roleId
  server.delete('/guilds/:guildId/reaction-roles/panels/:panelId/roles/:roleId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId, roleId } = request.params as { guildId: string; panelId: string; roleId: string };

    const existing = await prisma.reactionRole.findFirst({ where: { id: roleId, guildId, panelId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Role not found' });

    await prisma.reactionRole.delete({ where: { id: roleId } });
    await pub.publish('api:events', JSON.stringify({ type: 'reaction-role:panel-upsert', data: { panelId } }));
    return reply.send({ success: true, message: 'Deleted' });
  });
}
