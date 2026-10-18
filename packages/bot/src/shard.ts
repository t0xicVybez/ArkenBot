/**
 * Sharded launcher.
 *
 * Discord requires large bots to split their guilds across "shards" — separate
 * gateway connections. This process doesn't run the bot itself; it spawns one
 * or more child processes (each running `index.js`) and supervises them,
 * respawning any that die. Use this entry point instead of `index.ts` only when
 * running at a scale that needs sharding.
 */
import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Let Discord decide the shard count ('auto') unless SHARD_COUNT is set.
const shardCount = process.env.SHARD_COUNT
  ? parseInt(process.env.SHARD_COUNT, 10)
  : 'auto';

const manager = new ShardingManager(join(__dirname, 'index.js'), {
  token: config.discord.token,
  totalShards: shardCount,
  respawn: true,
});

// Log the lifecycle of each shard so problems are easy to trace.
manager.on('shardCreate', (shard) => {
  logger.info({ shardId: shard.id }, `Shard ${shard.id} launched`);

  shard.on('ready', () => logger.info({ shardId: shard.id }, `Shard ${shard.id} ready`));
  shard.on('disconnect', () => logger.warn({ shardId: shard.id }, `Shard ${shard.id} disconnected`));
  shard.on('reconnecting', () => logger.info({ shardId: shard.id }, `Shard ${shard.id} reconnecting`));
  shard.on('death', (process) => logger.error({ shardId: shard.id, exitCode: ('exitCode' in process ? process.exitCode : null) }, `Shard ${shard.id} died`));
  shard.on('error', (err) => logger.error({ shardId: shard.id, err }, `Shard ${shard.id} error`));
});

logger.info(`Starting ShardingManager with ${shardCount === 'auto' ? 'auto' : shardCount} shard(s)...`);

await manager.spawn();

// Functional self-check once all shards are up: confirm each shard loaded its
// commands and holds its slice of guilds, and report the fleet total. Surfaces
// a broken shard immediately instead of waiting for a user to notice.
try {
  const results = (await manager.broadcastEval((c) => ({
    shardId: c.shard?.ids?.[0] ?? 0,
    commands: (c as unknown as { commands?: { size: number } }).commands?.size ?? 0,
    guilds: c.guilds.cache.size,
    ping: Math.round(c.ws.ping),
  }))) as Array<{ shardId: number; commands: number; guilds: number; ping: number }>;
  const totalGuilds = results.reduce((sum, r) => sum + r.guilds, 0);
  logger.info({ shards: results, totalGuilds, shardCount: results.length }, 'Shard functional self-check');
} catch (err) {
  logger.error({ err }, 'Shard functional self-check failed');
}
