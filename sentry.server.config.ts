import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './src/lib/sentryScrub';

/**
 * Sunucu Sentry'si yalnız Vercel deploy'unda gönderir (`VERCEL_ENV`: production | preview). Yerel `next start`
 * (NODE_ENV=production olsa da) GÖNDERMEZ — yerel testler canlı veriyi "production" diye kirletiyordu.
 * Hata ayıklama için yerelde `NEXT_PUBLIC_SENTRY_DEBUG=true` → environment "development".
 */
const vercelEnv = process.env.VERCEL_ENV;

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: vercelEnv ?? 'development',
  // Performans izleme (tracing) kullanılmıyor: `tracesSampleRate` verilmedi → yalnız hata izleme.
  debug: false,
  // URL / sorgu / mesajdaki token, code, api_token ve authorization / cookie başlıkları gönderilmez.
  beforeSend: scrubSentryEvent,
  enabled: vercelEnv === 'production' || vercelEnv === 'preview' || process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true',
});
