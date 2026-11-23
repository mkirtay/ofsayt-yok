/**
 * Büyüme KPI olayları (büyüme raporu Faz 0): Vercel Web Analytics (`track`, çerezsiz) + GA4 (`gtag`, yalnız çerez
 * onayı varsa yüklü — lib/analyticsConsent.ts). Kişisel veri YOK: yalnız sabit listeli / sayısal alanlar.
 * KPI eşlemesi: docs/BUYUME_KPI.md.
 */
import { track } from '@vercel/analytics';
import { readConsent } from '@/lib/analyticsConsent';

type Events = {
  sign_up: { method: 'password' };
  analysis_unlock: { method: 'credit' | 'weekly_free' };
  prediction_submit: { scope: 'week' | 'day' };
  league_create: Record<string, never>;
  league_join: Record<string, never>;
  invite_share: { channel: 'copy' | 'whatsapp' | 'league_whatsapp' | 'league_share' };
  team_pass_purchase: { cost: number };
  push_enable: Record<string, never>;
  /** Hakem sayfasından maç sayfasına geçiş (reklam → hakem → maç yolculuğu). */
  referee_match_click: { slot: 'next_card'; referee_id: number; match_id: number };
};

export function trackGrowth<K extends keyof Events>(event: K, params: Events[K]): void {
  try {
    track(event, params as Record<string, string | number>);
  } catch {
    // analitik yok / engellenmiş
  }
  // GA yalnız güncel onayla: onay bu oturumda geri alınsa da `window.gtag` sayfada kalır, o yüzden her olayda okunur.
  if (readConsent() !== 'granted') return;
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', event, params);
  } catch {
    // gtag yok (onay verilmedi)
  }
}
