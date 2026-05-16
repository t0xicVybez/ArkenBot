/**
 * Centralised runtime configuration derived from environment variables.
 * All required variables throw at startup if absent, preventing silent
 * misconfiguration in production.
 */
import 'dotenv/config';

/** Reads a required environment variable, throwing if it is absent or empty. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Reads an optional environment variable, returning `defaultValue` if absent. */
function optional(name: string, defaultValue = ''): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  port: parseInt(optional('API_PORT', '4000')),
  host: optional('API_HOST', '0.0.0.0'),
  secret: required('API_SECRET'),

  discord: {
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    redirectUri: optional('DISCORD_REDIRECT_URI', 'http://localhost:3000/auth/callback'),
    botToken: optional('DISCORD_TOKEN', ''),
  },

  database: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    password: optional('REDIS_PASSWORD'),
  },

  /** Discord user IDs granted bot-owner privileges. */
  owners: optional('BOT_OWNER_IDS', '').split(',').map((id) => id.trim()).filter(Boolean),
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),

  cors: {
    origin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  },

  jwt: {
    accessExpiry: optional('JWT_ACCESS_EXPIRY', '1h'),
    refreshExpiry: optional('JWT_REFRESH_EXPIRY', '90d'),
  },
};
