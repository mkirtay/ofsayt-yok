/**
 * Tarayıcı açılış kancası (Next 15.3+). Turbopack'te `sentry.client.config.ts` otomatik enjekte
 * edilmiyor — bu dosya olmadan istemci tarafı Sentry başlatılmıyordu (canlıda `window.__SENTRY__` yoktu).
 */
import * as Sentry from '@sentry/nextjs';
import '../sentry.client.config';

/** Sayfa geçişlerini Sentry performans izine bağlar (Sentry build eklentisi bu export'u bekliyor). */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
