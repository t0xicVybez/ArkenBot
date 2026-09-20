/**
 * Entry point for the ArkenBot API server. Connects to the database and Redis,
 * starts the Fastify server, and registers OS signal handlers for graceful shutdown.
 */
import 'dotenv/config';
import { config } from './config.js';
import { logger } from './logger.js';
import { connectDatabase, disconnectDatabase } from './database.js';
import { connectRedis, disconnectRedis } from './redis.js';
import { createServer } from './server.js';
import { initSentry, captureError } from './sentry.js';
import { reconcileSubscriptions } from './services/youtubeWebsub.js';

async function main() {
  logger.info('Starting API server...');
  initSentry(); // inert unless SENTRY_DSN is set

  await connectDatabase();
  await connectRedis();

  const server = await createServer();

  await server.listen({ port: config.port, host: config.host });
  logger.info(`API server listening on port ${config.port}`);

  // YouTube WebSub: reconcile + renew subscriptions on startup and hourly. The
  // hourly cadence also retries channels stuck 'failed'/'pending' — e.g. while
  // Google's public hub is 503-ing — so push resumes automatically when it
  // recovers. WebSub (un)subscribe costs no YouTube Data API quota.
  if (config.youtubeApiKey) {
    setTimeout(() => void reconcileSubscriptions().catch((err) => logger.warn({ err }, 'YouTube WebSub reconcile failed')), 30_000);
    setInterval(() => void reconcileSubscriptions().catch((err) => logger.warn({ err }, 'YouTube WebSub reconcile failed')), 60 * 60 * 1000);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await server.close();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    captureError(err, { kind: 'uncaughtException' });
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    captureError(reason, { kind: 'unhandledRejection' });
    logger.error({ reason }, 'Unhandled rejection');
  });
}

main().catch((err) => {
  captureError(err, { kind: 'startup' });
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
