import type { BrowserOptions } from '@sentry/nextjs';

/**
 * Tarayıcı Sentry ayarları — yalnızca hata izleme. SDK ilk açılışta YÜKLENMEZ: ilk hatada dinamik
 * yüklenip bu ayarlarla başlatılır (bkz. src/lib/lazySentry.ts, src/instrumentation-client.ts).
 * - Yalnız production deploy'unda açık (preview/yerel kapalı).
 * - Performans izleme (tracing) KAPALI: `tracesSampleRate` verilmedi; `@sentry/nextjs`'in varsayılan
 *   eklediği `BrowserTracing` süzülüyor.
 * - Session Replay YOK: `replayIntegration` eklenmedi.
 * - Kişisel veri gönderilmez (`sendDefaultPii: false`: IP, çerez, kullanıcı bilgisi eklenmez).
 */
export const SENTRY_CLIENT_ENABLED = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

export const SENTRY_CLIENT_OPTIONS: BrowserOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  enabled: SENTRY_CLIENT_ENABLED,
  sendDefaultPii: false,
  integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserTracing'),
};
