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

/** Reads an optional integer environment variable, falling back to `defaultValue`. */
function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const config = {
  port: parseInt(optional('API_PORT', '4000')),
  host: optional('API_HOST', '0.0.0.0'),
  secret: required('API_SECRET'),

  discord: {
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    // Now points at the API — the callback is handled server-side, not by the web app.
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

  /** Discord user IDs granted bot-owner privileges. */
  owners: optional('BOT_OWNER_IDS', '').split(',').map((id) => id.trim()).filter(Boolean),
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),

  cors: {
    origin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  },

  /** Public URL of the dashboard — the OAuth callback redirects the browser back here. */
  web: {
    url: optional('WEB_URL', 'http://localhost:3000'),
  },

  /**
   * Opaque session cookie. `secure` is enabled in production only so the flow
   * still works over plain HTTP during local development. `sameSite: 'lax'` is
   * sufficient because the dashboard and API are same-site (shared registrable
   * domain in production); it still blocks cross-site request forgery.
   */
  cookie: {
    name: optional('SESSION_COOKIE_NAME', 'arken_session'),
    domain: optional('SESSION_COOKIE_DOMAIN') || undefined,
    secure: optional('NODE_ENV', 'development') === 'production',
    sameSite: 'lax' as const,
  },

  /**
   * Server-side session lifetimes (milliseconds).
   * - `absoluteExpiryMs` — hard cap; a session cannot outlive this from creation.
   * - `idleExpiryMs`     — sliding idle timeout, extended on each request.
   * - `rotateAfterMs`    — reissue the opaque id once the current one is older than this.
   * - `graceMs`          — window after a rotation in which the just-replaced id is
   *                        still accepted (absorbs in-flight concurrent requests).
   */
  session: {
    absoluteExpiryMs: optionalInt('SESSION_ABSOLUTE_EXPIRY_MS', 30 * 24 * 3600 * 1000),
    idleExpiryMs: optionalInt('SESSION_IDLE_EXPIRY_MS', 7 * 24 * 3600 * 1000),
    rotateAfterMs: optionalInt('SESSION_ROTATE_AFTER_MS', 12 * 3600 * 1000),
    graceMs: optionalInt('SESSION_ROTATION_GRACE_MS', 60 * 1000),
  },
};
