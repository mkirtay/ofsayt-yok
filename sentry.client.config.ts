import * as Sentry from '@sentry/nextjs';

/**
 * Tarayıcı: yalnızca hata izleme (bkz. src/instrumentation-client.ts).
 * - Yalnız production deploy'unda açık (preview/yerel kapalı).
 * - Performans izleme (tracing) KAPALI: `tracesSampleRate` bilerek verilmedi.
 * - Session Replay YOK: `replayIntegration` eklenmedi.
 * - Kişisel veri gönderilmez (`sendDefaultPii: false`: IP, çerez, kullanıcı bilgisi eklenmez).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production',
  sendDefaultPii: false,
});
