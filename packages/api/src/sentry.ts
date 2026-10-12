
import * as Sentry from '@sentry/node';

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    release: process.env.APP_VERSION,

    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  enabled = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
