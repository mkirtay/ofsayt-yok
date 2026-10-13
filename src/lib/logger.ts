import * as Sentry from '@sentry/nextjs';

export function captureError(context: string, err: unknown): void {
  console.error(`[${context}]`, err);
  Sentry.captureException(err, { tags: { context } });
}

/** Hata değil ama izlenmesi gereken durum (Sentry'de warning düzeyinde mesaj). */
export function captureWarning(context: string, message: string, extra?: Record<string, unknown>): void {
  console.warn(`[${context}] ${message}`, extra ?? '');
  Sentry.captureMessage(message, { level: 'warning', tags: { context }, extra });
}
