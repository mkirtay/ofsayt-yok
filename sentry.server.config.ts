import * as Sentry from '@sentry/nextjs';
import { scrubSentryBreadcrumb, scrubSentryEvent } from './src/lib/sentryScrub';

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
  // Kişisel veri (IP, çerez, kullanıcı) eklenmez — varsayılan da false, bilinçli olarak açık yazıldı.
  sendDefaultPii: false,
  // Olayın tamamı ve her breadcrumb derin temizlenir: token / api_token / password / secret … değerleri,
  // authorization / cookie başlıkları, fetch breadcrumb'ındaki `http.query` (bkz. src/lib/sentryScrub.ts).
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  // Gelen istek GÖVDESİ hiç yakalanmaz (şifre, sıfırlama belirteci, sohbet metni — güvenlik raporu Y2). @sentry/nextjs
  // varsayılan `Http` entegrasyonunu `disableIncomingRequestSpans: true` ile kuruyor; aynı adla değiştirilir (çift
  // eklenmez) ve o ayar korunur — yalnız gövde boyutu `'none'`.
  integrations: (defaults) =>
    defaults.map((i) =>
      i.name === 'Http'
        ? Sentry.httpIntegration({ disableIncomingRequestSpans: true, maxIncomingRequestBodySize: 'none' })
        : i,
    ),
  enabled: vercelEnv === 'production' || vercelEnv === 'preview' || process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true',
});
