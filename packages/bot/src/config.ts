/**
 * Centralised runtime configuration loaded from environment variables.
 * Required variables throw at startup if absent; optional variables fall back
 * to safe development defaults.
 */

import 'dotenv/config';

/**
 * Returns the value of a required environment variable.
 * Throws at startup if the variable is missing or empty, preventing silent
 * misconfiguration in production.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Returns the value of an optional environment variable, falling back to
 * `defaultValue` when the variable is absent.
 */
function optional(name: string, defaultValue = ''): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    guildId: optional('DISCORD_GUILD_ID'),
  },
  database: {
    url: required('DATABASE_URL'),
  },
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    password: optional('REDIS_PASSWORD'),
  },
  api: {
    url: optional('API_URL', 'http://localhost:4000'),
    secret: optional('API_SECRET', 'internal_secret'),
  },
  webUrl: optional('WEB_URL', 'http://localhost:3000'),
  lavalink: {
    host: optional('LAVALINK_HOST', 'localhost'),
    port: parseInt(optional('LAVALINK_PORT', '2333')),
    password: optional('LAVALINK_PASSWORD', 'youshallnotpass'),
    secure: optional('LAVALINK_SECURE', 'false') === 'true',
  },
  owners: optional('BOT_OWNER_IDS', '').split(',').filter(Boolean),
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  addonsDir: optional('ADDONS_DIR', '../../addons'),
};
