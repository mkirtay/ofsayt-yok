import { describe, expect, it } from 'vitest';
import * as catalog from './creditPackages';
import { CREDIT_PACKAGES, formatTry, perCreditKurus } from './creditPackages';

describe('kredi paketleri (karar 4–5)', () => {
  it('paketler ve fiyatlar (kuruş, KDV dahil)', () => {
    expect(CREDIT_PACKAGES.map((p) => [p.paymentKey, p.credits, p.priceKurus])).toEqual([
      ['credits_10', 10, 3999],
      ['credits_30', 30, 9999],
      ['credits_100', 100, 24999],
    ]);
  });

  it('premium planları katalogda yok (premium kaldırıldı)', () => {
    expect(Object.keys(catalog)).not.toContain('PREMIUM_PLANS');
  });

  it('biçim ve türetilenler', () => {
    expect(formatTry(3999)).toBe('39,99 TL');
    expect(formatTry(24999)).toBe('249,99 TL');
    expect(CREDIT_PACKAGES.map(perCreditKurus)).toEqual([400, 333, 250]);
  });
});
