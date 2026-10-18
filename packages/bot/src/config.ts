/**
 * Central configuration, read once from environment variables.
 *
 * `required` throws at startup if a critical variable is missing (so we fail
 * loudly instead of misbehaving later); `optional` falls back to a default.
 * Import `config` anywhere you need a token, URL or tuning value.
 */
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

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
  // Comma-separated Discord user IDs that get bot-owner privileges.
  owners: optional('BOT_OWNER_IDS', '').split(',').filter(Boolean),
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  addonsDir: optional('ADDONS_DIR', '../../addons'),

  valorant: {
    clientId: optional('RIOT_CLIENT_ID', ''),
    clientSecret: optional('RIOT_CLIENT_SECRET', ''),
    apiKey: optional('RIOT_API_KEY', ''),
    redirectUri: optional('RIOT_RSO_REDIRECT', 'https://api.arkenbot.app/valorant/rso/callback'),
    // The Valorant integration stays dormant until all three Riot credentials
    // are present, so features can check this before doing anything.
    get isConfigured(): boolean {
      return Boolean(process.env.RIOT_CLIENT_ID && process.env.RIOT_CLIENT_SECRET && process.env.RIOT_API_KEY);
    },
  },
};
