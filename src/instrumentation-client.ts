/**
 * Tarayıcı açılış kancası (Next 15.3+). Sentry SDK burada İMPORT EDİLMEZ — yalnızca ilk hatada dinamik
 * yüklenir (bkz. src/lib/lazySentry.ts); ilk açılış maliyeti ~0.
 */
import { installLazySentry } from '@/lib/lazySentry';
import { SENTRY_CLIENT_ENABLED, SENTRY_CLIENT_OPTIONS } from '../sentry.client.config';

installLazySentry({
  target: window,
  enabled: SENTRY_CLIENT_ENABLED,
  options: SENTRY_CLIENT_OPTIONS as { dsn?: string } & Record<string, unknown>,
  load: () => import('@sentry/nextjs'),
});

/** Sentry build eklentisi bu export'u bekliyor; tracing kapalı olduğu için sayfa geçişi izlenmiyor (no-op). */
export const onRouterTransitionStart = () => {};
