import type { HintLabels } from './hintLayer';

/** Baloncuk düğme metinleri — `common` namespace `onboarding.*` (kök i18n bağlamı dışında çizildiği için çevrilmiş geçer). */
export function hintLabels(t: (key: string, opts?: Record<string, unknown>) => string): HintLabels {
  return {
    ok: t('onboarding.ok'),
    close: t('onboarding.close'),
    next: t('onboarding.next'),
    done: t('onboarding.done'),
    skip: t('onboarding.skip'),
    step: (current, total) => t('onboarding.step', { current, total }),
  };
}
