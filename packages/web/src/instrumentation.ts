/**
 * Next.js instrumentation hook. Server-side error reporting via Sentry —
 * completely inert unless SENTRY_DSN is set, so it is safe to ship enabled.
 * (Client/browser errors can be added later with @sentry/browser.)
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'production',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
  }
}

// Called by Next on any server-side request error (SSR, route handlers, RSC).
export async function onRequestError(err: unknown): Promise<void> {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.captureException(err);
  }
}
