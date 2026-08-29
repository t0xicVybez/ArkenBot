/**
 * Bot entry point. Connects to all external services, loads handlers and addons,
 * then logs the client in and registers process signal handlers for graceful shutdown.
 */

import 'dotenv/config';
import { config } from './config.js';
import { BotClient } from './client.js';
import { CommandHandler } from './handlers/CommandHandler.js';
import { EventHandler } from './handlers/EventHandler.js';
import { AddonHandler } from './handlers/AddonHandler.js';
import { BackgroundJobs } from './modules/BackgroundJobs.js';
import { connectDatabase } from './database.js';
import { connectRedis } from './redis.js';
import { logger, swallow} from './logger.js';
import { initSentry, captureError } from './sentry.js';

// When the ShardingManager spawns shard processes it sets SHARDS to a JSON
// array of shard IDs (e.g. "[0]"). Each shard gets its own lock key so they
// don't incorrectly block each other at startup.
const shardIds = process.env.SHARDS ? (JSON.parse(process.env.SHARDS) as number[]) : null;
const INSTANCE_LOCK_KEY = shardIds !== null
  ? `bot:instance:lock:shard:${shardIds[0]}`
  : 'bot:instance:lock';
const LOCK_TTL_SECONDS = 30;

async function main() {
  logger.info('Starting Discord bot...');
  initSentry(); // inert unless SENTRY_DSN is set

  await connectDatabase();
  await connectRedis();

  // Singleton guard: abort immediately if another bot process already holds the
  // lock. The lock refreshes every 15 seconds; if the current holder crashes
  // without releasing it, the TTL lets a new process acquire it within 30 s.
  const { redis } = await import('./redis.js');
  const acquired = await redis.set(INSTANCE_LOCK_KEY, process.pid, 'EX', LOCK_TTL_SECONDS, 'NX');
  if (!acquired) {
    const holder = await redis.get(INSTANCE_LOCK_KEY);
    logger.error(`Another bot instance is already running (PID ${holder}). Exiting to prevent duplicate events.`);
    process.exit(1);
  }
  logger.info(`Instance lock acquired (PID ${process.pid})`);

  // Refresh the lock every 15 seconds so it outlives the TTL between refreshes.
  const lockRefresher = setInterval(async () => {
    await redis.set(INSTANCE_LOCK_KEY, process.pid, 'EX', LOCK_TTL_SECONDS, 'XX').catch(swallow);
  }, 15_000);

  const client = new BotClient();

  const commandHandler = new CommandHandler(client);
  const eventHandler = new EventHandler(client);
  const addonHandler = new AddonHandler(client);

  await commandHandler.loadCommands();
  await eventHandler.loadEvents();
  await addonHandler.loadAddons();

  // Register background jobs before login so the clientReady event is never missed.
  const jobs = new BackgroundJobs(client);
  client.once('clientReady', () => jobs.start());

  await client.login(config.discord.token);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    clearInterval(lockRefresher);
    await redis.del(INSTANCE_LOCK_KEY).catch(swallow);
    jobs.stop();
    client.destroy();

    const { disconnectDatabase } = await import('./database.js');
    const { disconnectRedis } = await import('./redis.js');

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
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
