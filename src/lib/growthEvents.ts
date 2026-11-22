/**
 * Büyüme KPI olayları (büyüme raporu Faz 0): Vercel Web Analytics (`track`, çerezsiz) + GA4 (`gtag`, yalnız çerez
 * onayı varsa yüklü — lib/analyticsConsent.ts). Kişisel veri YOK: yalnız sabit listeli / sayısal alanlar.
 * KPI eşlemesi: docs/BUYUME_KPI.md.
 */
import { track } from '@vercel/analytics';

type Events = {
  sign_up: { method: 'password' };
  analysis_unlock: { method: 'credit' | 'weekly_free' };
  prediction_submit: { scope: 'week' | 'day' };
  league_create: Record<string, never>;
  league_join: Record<string, never>;
  invite_share: { channel: 'copy' | 'whatsapp' | 'league_whatsapp' | 'league_share' };
  team_pass_purchase: { cost: number };
  push_enable: Record<string, never>;
};

export function trackGrowth<K extends keyof Events>(event: K, params: Events[K]): void {
  try {
    track(event, params as Record<string, string | number>);
  } catch {
    // analitik yok / engellenmiş
  }
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', event, params);
  } catch {
    // gtag yok (onay verilmedi)
  }
}
