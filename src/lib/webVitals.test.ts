import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextWebVitalsMetric } from 'next/app';
import { CONSENT_STORAGE_KEY } from './analyticsConsent';
import { flushPendingWebVitals, reportWebVitalToGa, webVitalEvent, webVitalRating } from './webVitals';

const metric = (name: string, value: number, label: 'web-vital' | 'custom' = 'web-vital') =>
  ({ id: `v-${name}`, name, value, startTime: 0, label }) as NextWebVitalsMetric;

describe('webVitalRating', () => {
  it('web.dev eşikleri', () => {
    expect(webVitalRating('LCP', 2500)).toBe('good');
    expect(webVitalRating('LCP', 3000)).toBe('needs-improvement');
    expect(webVitalRating('LCP', 4001)).toBe('poor');
    expect(webVitalRating('CLS', 0.05)).toBe('good');
    expect(webVitalRating('INP', 600)).toBe('poor');
  });
});

describe('webVitalEvent', () => {
  it('CLS ×1000 tam sayı; adres temizlenir; özel Next ölçümleri gönderilmez', () => {
    const e = webVitalEvent(metric('CLS', 0.1234), 'https://www.getscor3.com/odeme/tamamlandi?customerEmail=a@b.c');
    expect(e?.name).toBe('CLS');
    expect(e?.params.value).toBe(123);
    expect(e?.params.metric_rating).toBe('needs-improvement');
    expect(e?.params.page_location).not.toContain('a@b.c');
    expect(webVitalEvent(metric('Next.js-hydration', 50, 'custom'), 'https://x/')).toBeNull();
  });
});

describe('reportWebVitalToGa', () => {
  const store = new Map<string, string>();
  const win: { gtag?: (...a: unknown[]) => void; location: { href: string }; localStorage: Pick<Storage, 'getItem' | 'setItem'> } = {
    location: { href: 'https://www.getscor3.com/' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
  };
  beforeEach(() => {
    store.clear();
    delete win.gtag;
    vi.stubGlobal('window', win);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('onay yoksa hiçbir şey göndermez', () => {
    const gtag = vi.fn();
    win.gtag = gtag;
    reportWebVitalToGa(metric('LCP', 1200));
    expect(gtag).not.toHaveBeenCalled();
  });

  it('onay varsa GA olayı; GA kurulmadan gelenler kuyruktan sonra gider', () => {
    store.set(CONSENT_STORAGE_KEY, 'granted');
    reportWebVitalToGa(metric('TTFB', 300));
    const gtag = vi.fn();
    win.gtag = gtag;
    reportWebVitalToGa(metric('LCP', 1200));
    expect(gtag).toHaveBeenCalledWith('event', 'LCP', expect.objectContaining({ value: 1200, metric_rating: 'good' }));
    flushPendingWebVitals();
    expect(gtag).toHaveBeenCalledWith('event', 'TTFB', expect.objectContaining({ value: 300 }));
  });
});
