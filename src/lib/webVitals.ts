import type { NextWebVitalsMetric } from 'next/app';
import { readConsent } from '@/lib/analyticsConsent';
import { scrubAnalyticsUrl } from '@/lib/analyticsScrub';

/**
 * Gerçek kullanıcı Web Vitals ölçümü → GA4 olayı (Lighthouse yalnız simülasyon; mobil kullanıcının gerçek LCP / INP /
 * CLS değerini bu ölçer). Yalnız çerez onayı "granted" iken gönderilir — GA zaten yalnız onayla yükleniyor
 * (components/CookieConsent/GoogleAnalytics.tsx). GA gelmeden ölçülenler (TTFB / FCP erken gelir) kuyrukta bekler,
 * GA kurulunca `flushPendingWebVitals` ile gönderilir.
 *
 * GA4'te raporlamak için: Yönetici → Özel tanımlar → olay kapsamlı boyut `metric_rating` (+ isteğe bağlı `metric_id`).
 * Olay adları: LCP, INP, CLS, FCP, TTFB. `value` ms (CLS ×1000, tam sayı — GA toplamları tam sayıyla çalışır).
 */

type Vital = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB' | 'FID';

/** web.dev eşikleri: [iyi üst sınır, kötü alt sınır]. */
const THRESHOLDS: Record<Vital, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
  FID: [100, 300],
};

export type VitalRating = 'good' | 'needs-improvement' | 'poor';

export function webVitalRating(name: Vital, value: number): VitalRating {
  const [good, poor] = THRESHOLDS[name];
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
}

export type WebVitalEvent = {
  name: Vital;
  params: {
    value: number;
    metric_id: string;
    metric_value: number;
    metric_rating: VitalRating;
    non_interaction: true;
    page_location: string;
  };
};

export function webVitalEvent(metric: NextWebVitalsMetric, href: string): WebVitalEvent | null {
  if (metric.label !== 'web-vital' || !(metric.name in THRESHOLDS)) return null;
  const name = metric.name as Vital;
  return {
    name,
    params: {
      value: Math.round(name === 'CLS' ? metric.value * 1000 : metric.value),
      metric_id: metric.id,
      metric_value: metric.value,
      metric_rating: webVitalRating(name, metric.value),
      non_interaction: true,
      page_location: scrubAnalyticsUrl(href),
    },
  };
}

const pending: WebVitalEvent[] = [];
const MAX_PENDING = 10;

function send(e: WebVitalEvent): void {
  window.gtag?.('event', e.name, e.params);
}

/** `_app`'in `reportWebVitals` dışa aktarımı çağırır. */
export function reportWebVitalToGa(metric: NextWebVitalsMetric): void {
  if (typeof window === 'undefined' || readConsent() !== 'granted') return;
  const e = webVitalEvent(metric, window.location.href);
  if (!e) return;
  if (window.gtag) send(e);
  else if (pending.length < MAX_PENDING) pending.push(e);
}

/** GA (gtag yer tutucusu) kurulunca bekleyen ölçümleri gönderir. */
export function flushPendingWebVitals(): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  for (const e of pending.splice(0)) send(e);
}
