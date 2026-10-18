/**
 * Bot entry point.
 *
 * This is the first file that runs when the bot process starts. It wires up the
 * core pieces in order — config, database, Redis, command/event/addon handlers —
 * logs the bot into Discord, and makes sure we shut down cleanly when the
 * process is asked to stop.
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

// When running as a sharded fleet, each shard gets its own lock key so one
// instance per shard can run; unsharded deployments share a single key.
// discord.js's ShardingManager passes this shard's id via the SHARDS env var,
// but the format varies (a bare number like `0`, a JSON array like `[0]`, or a
// comma list). Normalize to a number[] so each shard gets its OWN lock key —
// otherwise every shard computes the same key and all but the first die with
// "another instance already running".
function parseShardIds(raw: string | undefined): number[] | null {
  if (!raw) return null;
  let ids: number[];
  try {
    const parsed = JSON.parse(raw) as number | number[];
    ids = Array.isArray(parsed) ? parsed.map(Number) : [Number(parsed)];
  } catch {
    ids = raw.split(',').map((s) => Number(s.trim()));
  }
  ids = ids.filter((n) => Number.isInteger(n));
  return ids.length ? ids : null;
}
const shardIds = parseShardIds(process.env.SHARDS);
const INSTANCE_LOCK_KEY = shardIds
  ? `bot:instance:lock:shard:${shardIds[0]}`
  : 'bot:instance:lock';
const LOCK_TTL_SECONDS = 30;

async function main() {
  logger.info('Starting Discord bot...');
  initSentry();

  await connectDatabase();
  await connectRedis();

  // Guard against running two copies of the bot at once. Two instances would
  // both receive every gateway event and double-process everything (double
  // XP, duplicate replies, etc.), so we take a short-lived Redis lock keyed to
  // our process id. If someone else already holds it, we bow out.
  const { redis } = await import('./redis.js');
  const acquired = await redis.set(INSTANCE_LOCK_KEY, process.pid, 'EX', LOCK_TTL_SECONDS, 'NX');
  if (!acquired) {
    const holder = await redis.get(INSTANCE_LOCK_KEY);
    logger.error(`Another bot instance is already running (PID ${holder}). Exiting to prevent duplicate events.`);
    process.exit(1);
  }
  logger.info(`Instance lock acquired (PID ${process.pid})`);

  // The lock expires after 30s so a crashed process can't hold it forever.
  // Refresh it every 15s while we're alive to keep ownership.
  const lockRefresher = setInterval(async () => {
    await redis.set(INSTANCE_LOCK_KEY, process.pid, 'EX', LOCK_TTL_SECONDS, 'XX').catch(swallow);
  }, 15_000);

  const client = new BotClient();

  // Load everything the bot responds with: slash commands, gateway event
  // listeners, and first-party addons.
  const commandHandler = new CommandHandler(client);
  const eventHandler = new EventHandler(client);
  const addonHandler = new AddonHandler(client);

  await commandHandler.loadCommands();
  await eventHandler.loadEvents();
  await addonHandler.loadAddons();

  // Scheduled work (giveaways, reminders, stats channels, …) only starts once
  // the client is fully connected and ready.
  const jobs = new BackgroundJobs(client);
  client.once('clientReady', () => jobs.start());

  await client.login(config.discord.token);

  // Graceful shutdown: release the instance lock, stop timers, and close the
  // database/Redis connections so a restart comes up cleanly.
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

  // Last-resort safety nets. A truly uncaught error leaves us in an unknown
  // state, so we report it and exit (the process manager restarts us); a stray
  // promise rejection is logged but not fatal.
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
