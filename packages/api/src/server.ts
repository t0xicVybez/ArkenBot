/**
 * Configures and returns the Fastify application instance with all plugins,
 * route handlers, WebSocket gateway, and global error handling.
 */
import Fastify, { type FastifyError } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebSocket from '@fastify/websocket';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { config } from './config.js';
import { logger } from './logger.js';
import { connectRedis, redis } from './redis.js';
import { authRoutes } from './routes/auth.js';
import { guildRoutes } from './routes/guilds.js';
import { settingsRoutes } from './routes/settings.js';
import { moderationRoutes } from './routes/moderation.js';
import { addonRoutes } from './routes/addons.js';
import { adminRoutes } from './routes/admin.js';
import { ticketAddonRoutes } from './routes/addon-tickets.js';
import { publicRoutes } from './routes/public.js';
import { featureRoutes } from './routes/features.js';
import { giveawayRoutes } from './routes/giveaways.js';
import { streamAlertRoutes } from './routes/streamAlerts.js';
import { topggRoutes } from './routes/topgg.js';
import { suggestionRoutes } from './routes/suggestions.js';
import { starboardRoutes } from './routes/starboard.js';
import { levelRoleRoutes } from './routes/levelRoles.js';
import { customCommandRoutes } from './routes/customCommands.js';
import { autoResponseRoutes } from './routes/autoResponses.js';
import { achievementRoutes } from './routes/achievements.js';
import { reputationRoutes } from './routes/reputation.js';
import { personalizationRoutes } from './routes/personalization.js';
import { countingRoutes } from './routes/counting.js';
import { inviteTrackerRoutes } from './routes/inviteTracker.js';
import { embedRoutes } from './routes/embeds.js';
import { commandPermissionRoutes } from './routes/commandPermissions.js';
import { selfRoleRoutes } from './routes/selfRoles.js';
import { applicationRoutes } from './routes/applications.js';
import { userNoteRoutes } from './routes/userNotes.js';
import { reportRoutes } from './routes/reports.js';
import { mondayRoutes } from './routes/monday.js';
import { trelloRoutes } from './routes/trello.js';
import { auditLogRoutes } from './routes/auditLog.js';
import { configTransferRoutes } from './routes/configTransfer.js';
import { setupWebSocket } from './websocket/gateway.js';
import { prisma } from './database.js';
import { AuthService } from './services/AuthService.js';
import { collectDefaultMetrics } from 'prom-client';

/**
 * Builds and configures the Fastify server instance.
 * Registers all plugins, route groups, the WebSocket gateway, and a
 * `/health` endpoint. The body limit is set to 4 MB to support base64
 * image payloads from the embed builder.
 */
export async function createServer() {
  collectDefaultMetrics();

  await AuthService.cleanupExpiredSessions();

  const server = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.env !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    bodyLimit: 4 * 1024 * 1024,
  });

  // ─── Plugins ──────────────────────────────────────────────────────
  await server.register(fastifyCors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(fastifyHelmet, {
    contentSecurityPolicy: config.env === 'production',
  });

  // Rate limiting uses Redis so limits are shared across multiple API processes.
  // Authenticated requests are keyed by user ID rather than IP to avoid
  // penalising users behind shared NAT.
  await server.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) =>
      (request.user as { id: string } | undefined)?.id ?? request.ip,
  });

  await server.register(fastifyJwt, {
    secret: config.secret,
    sign: { expiresIn: config.jwt.accessExpiry },
  });

  await server.register(fastifyCookie, {
    secret: config.secret,
  });

  await server.register(fastifyWebSocket);


  // ─── Dashboard Audit Trail ────────────────────────────────────────
  // Records every successful mutating dashboard request against a guild
  // (who changed what, when). Bodies are never stored — they can contain
  // tokens and secrets. Root scope so it observes all route plugins.
  const AUDIT_MUTATING = new Set(['POST', 'PATCH', 'DELETE']);
  const AUDIT_GUILD_PATH = /^\/guilds\/(\d+)\/([^/?]+)/;
  server.addHook('onResponse', async (request, reply) => {
    try {
      if (!AUDIT_MUTATING.has(request.method)) return;
      if (reply.statusCode >= 400) return;
      const match = AUDIT_GUILD_PATH.exec(request.url.split('?')[0]);
      if (!match) return;
      const [, guildId, section] = match;
      if (section === 'audit-log') return;
      const user = request.user as { id?: string; username?: string } | undefined;
      if (!user?.id) return;
      void prisma.dashboardAuditLog.create({
        data: {
          guildId,
          userId: user.id,
          username: user.username ?? null,
          method: request.method,
          path: request.url.split('?')[0].slice(0, 512),
          section,
          statusCode: reply.statusCode,
        },
      }).catch(() => undefined);
    } catch { /* auditing must never break request handling */ }
  });

  // ─── Routes ───────────────────────────────────────────────────────
  await server.register(authRoutes);
  await server.register(guildRoutes);
  await server.register(settingsRoutes);
  await server.register(moderationRoutes);
  await server.register(addonRoutes);
  await server.register(adminRoutes);
  await server.register(ticketAddonRoutes);
  await server.register(publicRoutes);
  await server.register(featureRoutes);
  await server.register(giveawayRoutes);
  await server.register(streamAlertRoutes);
  await server.register(topggRoutes);
  await server.register(suggestionRoutes);
  await server.register(starboardRoutes);
  await server.register(levelRoleRoutes);
  await server.register(customCommandRoutes);
  await server.register(autoResponseRoutes);
  await server.register(achievementRoutes);
  await server.register(reputationRoutes);
  await server.register(personalizationRoutes);
  await server.register(countingRoutes);
  await server.register(inviteTrackerRoutes);
  await server.register(embedRoutes);
  await server.register(commandPermissionRoutes);
  await server.register(selfRoleRoutes);
  await server.register(applicationRoutes);
  await server.register(userNoteRoutes);
  await server.register(reportRoutes);
  await server.register(mondayRoutes);
  await server.register(trelloRoutes);
  await server.register(auditLogRoutes);
  await server.register(configTransferRoutes);

  // ─── WebSocket Gateway ────────────────────────────────────────────
  await setupWebSocket(server);

  // ─── Health Check ─────────────────────────────────────────────────
  server.get('/health', async () => ({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  // ─── Error Handler ────────────────────────────────────────────────
  server.setErrorHandler((error: FastifyError, request, reply) => {
    logger.error({ err: error, url: request.url }, 'Request error');

    if (error.validation) {
      return reply.code(400).send({ success: false, error: 'Validation error', details: error.validation });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({ success: false, error: error.message });
    }

    return reply.code(500).send({ success: false, error: 'Internal server error' });
  });

  return server;
}
