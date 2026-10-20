/**
 * Central API configuration, read from environment variables. `required` throws at startup if a critical variable is missing; `optional` falls back to a default.
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

function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function optionalSameSite(name: string, defaultValue: 'lax' | 'strict' | 'none'): 'lax' | 'strict' | 'none' {
  const raw = process.env[name];
  return raw === 'lax' || raw === 'strict' || raw === 'none' ? raw : defaultValue;
}

export const config = {
  port: parseInt(optional('API_PORT', '4000')),
  host: optional('API_HOST', '0.0.0.0'),
  secret: required('API_SECRET'),

  discord: {
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),

    redirectUri: optional('DISCORD_REDIRECT_URI', 'http://localhost:4000/auth/callback'),
    botToken: optional('DISCORD_TOKEN', ''),
  },

  database: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    password: optional('REDIS_PASSWORD'),
  },

  owners: optional('BOT_OWNER_IDS', '').split(',').map((id) => id.trim()).filter(Boolean),
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),

  cors: {
    origin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  },

  web: {
    url: optional('WEB_URL', 'http://localhost:3000'),
  },

  publicApiUrl: (optional('PUBLIC_API_URL') || optional('NEXT_PUBLIC_API_URL', 'http://localhost:4000')).replace(/\/$/, ''),

  youtubeApiKey: optional('YOUTUBE_API_KEY', ''),

  valorant: {
    clientId: optional('RIOT_CLIENT_ID', ''),
    clientSecret: optional('RIOT_CLIENT_SECRET', ''),
    apiKey: optional('RIOT_API_KEY', ''),

    redirectUri: optional('RIOT_RSO_REDIRECT', 'https://api.arkenbot.app/valorant/rso/callback'),
    get isConfigured(): boolean {
      return Boolean(process.env.RIOT_CLIENT_ID && process.env.RIOT_CLIENT_SECRET && process.env.RIOT_API_KEY);
    },
  },

  cookie: {
    name: optional('SESSION_COOKIE_NAME', 'arken_session'),
    domain: optional('SESSION_COOKIE_DOMAIN') || undefined,
    secure: optional('NODE_ENV', 'development') === 'production',
    // Self-hosters running the dashboard on a domain unrelated to this API
    // need 'none' (cross-site XHR/fetch still needs the cookie sent) + a
    // secure context. Default 'lax' is correct whenever dashboard and API
    // share a parent domain, as they do in this deployment.
    sameSite: optionalSameSite('SESSION_COOKIE_SAMESITE', 'lax'),
  },

  session: {
    absoluteExpiryMs: optionalInt('SESSION_ABSOLUTE_EXPIRY_MS', 30 * 24 * 3600 * 1000),
    idleExpiryMs: optionalInt('SESSION_IDLE_EXPIRY_MS', 7 * 24 * 3600 * 1000),
    rotateAfterMs: optionalInt('SESSION_ROTATE_AFTER_MS', 12 * 3600 * 1000),
    graceMs: optionalInt('SESSION_ROTATION_GRACE_MS', 60 * 1000),
  },
};
