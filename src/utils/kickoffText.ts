import { type Countdown } from './kickoff';

/** Geri sayım metni ("Başlamasına 2 sa 15 dk"). Maç öncesi kartlar ve anlatım bekleme sahnesi aynı metni kullanır. */
export function countdownText(c: Countdown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (c.kind === 'soon') return t('countdown.soon');
  if (c.kind === 'awaiting') return t('countdown.awaiting');
  const parts =
    c.days > 0
      ? [t('countdown.days', { n: c.days }), c.hours > 0 ? t('countdown.hours', { n: c.hours }) : '']
      : [c.hours > 0 ? t('countdown.hours', { n: c.hours }) : '', t('countdown.minutes', { n: c.minutes })];
  return t('countdown.startsIn', { left: parts.filter(Boolean).join(' ') });
}
