import * as Sentry from '@sentry/nextjs';

export function captureError(context: string, err: unknown): void {
  console.error(`[${context}]`, err);
  Sentry.captureException(err, { tags: { context } });
}
