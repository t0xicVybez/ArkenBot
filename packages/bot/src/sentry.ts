/**
 * Optional error reporting via Sentry.
 *
 * Sentry only turns on when a SENTRY_DSN is set, so local and self-hosted
 * deployments run without it. `captureError` is a no-op until `initSentry` has
 * enabled it, so callers can report errors unconditionally and not worry about
 * whether Sentry is configured.
 */
import * as Sentry from '@sentry/node';

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    release: process.env.APP_VERSION,
    // Performance tracing is off unless explicitly sampled, to control volume.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  enabled = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
