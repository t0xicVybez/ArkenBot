/**
 * Builds and configures the Fastify server: core plugins (cookies, CORS, rate limiting), the WebSocket gateway, every route group, and shared error handling. `createServer()` returns the ready-to-listen app.
 */
import Fastify, { type FastifyError } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebSocket from '@fastify/websocket';
import fastifyCookie from '@fastify/cookie';
import { config } from './config.js';
import { logger, errSerializer } from './logger.js';
import { captureError } from './sentry.js';
import { redis } from './redis.js';
import { authRoutes } from './routes/auth.js';
import { guildRoutes } from './routes/guilds.js';
import { permissionHealthRoutes } from './routes/permissionHealth.js';
import { gameAddonRoutes } from './routes/gameAddons.js';
import { economyRoutes } from './routes/economy.js';
import { appealsRoutes } from './routes/appeals.js';
import { settingsRoutes } from './routes/settings.js';
import { moderationRoutes } from './routes/moderation.js';
import { addonRoutes } from './routes/addons.js';
import { adminRoutes } from './routes/admin.js';
import { ticketAddonRoutes } from './routes/addon-tickets.js';
import { publicRoutes } from './routes/public.js';
import { userPreferencesRoutes } from './routes/userPreferences.js';
import { featureRoutes } from './routes/features.js';
import { giveawayRoutes } from './routes/giveaways.js';
import { streamAlertRoutes } from './routes/streamAlerts.js';
import { youtubeWebsubRoutes } from './routes/youtubeWebsub.js';
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
import { valorantRoutes } from './routes/valorant.js';
import { promotionRoutes } from './routes/promotion.js';
import { auditLogRoutes } from './routes/auditLog.js';
import { configTransferRoutes } from './routes/configTransfer.js';
import { dataControlsRoutes } from './routes/dataControls.js';
import { setupWebSocket } from './websocket/gateway.js';
import { prisma } from './database.js';
import { SessionService } from './services/SessionService.js';
import { collectDefaultMetrics } from 'prom-client';

export async function createServer() {
  collectDefaultMetrics();

  await SessionService.cleanupExpired();

  const server = Fastify({
    logger: {
      level: config.logLevel,
      serializers: { err: errSerializer },
      transport:
        config.env !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    bodyLimit: 4 * 1024 * 1024,

    trustProxy: config.env === 'production',
  });

  await server.register(fastifyCors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(fastifyHelmet, {
    contentSecurityPolicy: config.env === 'production',
  });

  await server.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) =>
      (request.user as { id: string } | undefined)?.id ?? request.ip,
  });

  await server.register(fastifyCookie, {
    secret: config.secret,
  });

  await server.register(fastifyWebSocket);

  const CSRF_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
  const allowedOrigins = new Set(
    [config.cors.origin, config.web.url].flatMap((o) => o.split(',')).map((o) => o.trim()).filter(Boolean)
  );
  server.addHook('onRequest', async (request, reply) => {
    if (!CSRF_METHODS.has(request.method)) return;

    const path = request.url.split('?')[0];
    if (path.includes('/webhook') || path.startsWith('/topgg/')) return;
    const origin = request.headers.origin;
    if (!origin) return;
    if (!allowedOrigins.has(origin)) {
      reply.code(403).send({ success: false, error: 'Cross-origin request blocked' });
    }
  });

  const AUDIT_MUTATING = new Set(['POST', 'PATCH', 'DELETE']);
  const AUDIT_GUILD_PATH = /^\/guilds\/(\d+)\/([^/?]+)/;
  const AUDIT_SENSITIVE_KEY = /token|secret|password|api[_-]?key|authorization|cookie/i;

  // Summarize a mutation's request body into a small, safe record of what was
  // changed: secrets redacted, huge/data-URI values collapsed, and field/size
  // capped so one audit row can't balloon from an avatar upload or a big array.
  const summarizeValue = (v: unknown, depth = 0): unknown => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) return '[data]';
      return v.length > 200 ? v.slice(0, 200) + '…' : v;
    }
    if (Array.isArray(v)) return v.length <= 20 ? v.map((x) => summarizeValue(x, depth + 1)) : `[${v.length} items]`;
    if (v && typeof v === 'object' && depth < 2) {
      const o: Record<string, unknown> = {};
      let i = 0;
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (i >= 20) break;
        o[k] = AUDIT_SENSITIVE_KEY.test(k) ? '[redacted]' : summarizeValue(val, depth + 1);
        i++;
      }
      return o;
    }
    return v ?? null;
  };
  const summarizeChanges = (body: unknown): Record<string, unknown> | undefined => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, val] of Object.entries(body as Record<string, unknown>)) {
      if (n >= 40) { out['…'] = 'more fields'; break; }
      out[k] = AUDIT_SENSITIVE_KEY.test(k) ? '[redacted]' : summarizeValue(val);
      n++;
    }
    return Object.keys(out).length ? out : undefined;
  };
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
          changes: summarizeChanges(request.body) as import('@prisma/client').Prisma.InputJsonValue | undefined,
        },
      }).catch(() => undefined);
    } catch {  }
  });

  await server.register(authRoutes);
  await server.register(guildRoutes);
  await server.register(permissionHealthRoutes);
  await server.register(gameAddonRoutes);
  await server.register(settingsRoutes);
  await server.register(economyRoutes);
  await server.register(appealsRoutes);
  await server.register(moderationRoutes);
  await server.register(addonRoutes);
  await server.register(adminRoutes);
  await server.register(ticketAddonRoutes);
  await server.register(publicRoutes);
  await server.register(userPreferencesRoutes);
  await server.register(featureRoutes);
  await server.register(giveawayRoutes);
  await server.register(streamAlertRoutes);
  await server.register(youtubeWebsubRoutes);
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
  await server.register(valorantRoutes);
  await server.register(promotionRoutes);
  await server.register(auditLogRoutes);
  await server.register(configTransferRoutes);
  await server.register(dataControlsRoutes);

  await setupWebSocket(server);

  server.get('/health', async () => ({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  server.setErrorHandler((error: FastifyError, request, reply) => {
    logger.error({ err: error, url: request.url }, 'Request error');

    if (error.validation) {
      return reply.code(400).send({ success: false, error: 'Validation error', details: error.validation });
    }

    if (!error.statusCode || error.statusCode >= 500) {
      captureError(error, { url: request.url, method: request.method });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({ success: false, error: error.message });
    }

    return reply.code(500).send({ success: false, error: 'Internal server error' });
  });

  return server;
}
