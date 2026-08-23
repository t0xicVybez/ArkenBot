/**
 * Shared pino logger instance. Uses pino-pretty with human-readable output
 * outside of production, and structured JSON in production.
 */
import pino from 'pino';
import { config } from './config.js';

/**
 * Error serializer that keeps useful diagnostics (message, stack, status, url)
 * but strips request/response headers and bodies. Axios and Discord REST errors
 * otherwise serialise their whole `config`/`request` — including the
 * `Authorization: Bearer …` header (and the raw `request._header` string) —
 * straight into the logs.
 */
interface SerializedError {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
}

export function errSerializer(err: unknown): SerializedError {
  const e = (err && typeof err === 'object' ? err : {}) as {
    name?: string;
    message?: string;
    stack?: string;
    code?: unknown;
    status?: unknown;
    config?: { method?: unknown; url?: unknown };
    response?: { status?: unknown };
    method?: unknown;
    url?: unknown;
    constructor?: { name?: string };
  };
  const out: SerializedError = {
    type: e.name ?? e.constructor?.name ?? 'Error',
    message: e.message ?? String(err),
    stack: e.stack ?? '',
  };
  if (e.code !== undefined) out.code = e.code;
  if (e.status !== undefined) out.status = e.status;
  if (e.config) {
    out.method = e.config.method;
    out.url = e.config.url;
  }
  if (e.response?.status !== undefined) out.responseStatus = e.response.status;
  if (e.method !== undefined) out.method = e.method; // discord.js REST errors
  if (e.url !== undefined) out.url = e.url; // discord.js REST errors
  return out;
}

export const logger = pino({
  level: config.logLevel,
  serializers: { err: errSerializer },
  transport:
    config.env !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
      : undefined,
});
