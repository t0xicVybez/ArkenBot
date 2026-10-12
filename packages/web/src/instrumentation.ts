
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

export async function onRequestError(err: unknown): Promise<void> {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.captureException(err);
  }
}
