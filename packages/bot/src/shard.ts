/**
 * Sharding entry point. Run this file instead of index.ts to enable horizontal
 * scaling across multiple processes.
 *
 * Each shard spawned by the ShardingManager runs dist/index.js and handles a
 * disjoint subset of guilds. Set SHARD_COUNT to a specific number to override
 * Discord's automatic shard recommendation.
 *
 * Usage:
 *   node dist/shard.js
 *
 * Environment variables:
 *   SHARD_COUNT — number of shards to spawn (default: 'auto', delegates to Discord)
 */

import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const shardCount = process.env.SHARD_COUNT
  ? parseInt(process.env.SHARD_COUNT, 10)
  : 'auto';

const manager = new ShardingManager(join(__dirname, 'index.js'), {
  token: config.discord.token,
  totalShards: shardCount,
  respawn: true,
});

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
