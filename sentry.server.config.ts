import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  debug: false,
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true',
});
