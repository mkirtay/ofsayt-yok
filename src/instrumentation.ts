import * as Sentry from '@sentry/nextjs';

/**
 * Next.js sunucu açılış kancası. @sentry/nextjs 8+ ile `sentry.server.config.ts` artık otomatik
 * enjekte edilmiyor — bu dosya olmadan sunucu tarafı Sentry HİÇ başlatılmıyordu (kota olayları,
 * `captureError` sessizce kayboluyordu). Middleware (edge) için ayrı yapılandırma yok.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
}

/** Route/SSR hatalarını Sentry'ye iletir. */
export const onRequestError = Sentry.captureRequestError;
