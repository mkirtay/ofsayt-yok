import * as Sentry from '@sentry/nextjs';

/**
 * Tarayıcı: yalnızca hata izleme (bkz. src/instrumentation-client.ts).
 * - Yalnız production deploy'unda açık (preview/yerel kapalı).
 * - Performans izleme (tracing) KAPALI: `tracesSampleRate` verilmedi ve `@sentry/nextjs`'in varsayılan
 *   eklediği `BrowserTracing` aşağıda süzülüyor (kurulmaz, çalışmaz). Kodu bundle'da kalıyor: Turbopack'te
 *   ne `bundleSizeOptimizations.excludeTracing` ne `compiler.define` node_modules'a uygulanıyor (ölçüldü);
 *   bundle'dan tamamen çıkarmak için SDK'yı ilk hatada tembel yüklemek gerekir.
 * - Session Replay YOK: `replayIntegration` eklenmedi.
 * - Kişisel veri gönderilmez (`sendDefaultPii: false`: IP, çerez, kullanıcı bilgisi eklenmez).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production',
  sendDefaultPii: false,
  integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserTracing'),
});
