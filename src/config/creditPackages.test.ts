import { describe, expect, it } from 'vitest';
import { CREDIT_PACKAGES, PREMIUM_PLANS, formatTry, perCreditKurus, yearlyFreeMonths } from './creditPackages';

describe('kredi paketleri ve premium (karar 4–5)', () => {
  it('paketler ve fiyatlar (kuruş, KDV dahil)', () => {
    expect(CREDIT_PACKAGES.map((p) => [p.credits, p.priceKurus])).toEqual([
      [10, 3999],
      [30, 9999],
      [100, 24999],
    ]);
    expect(PREMIUM_PLANS.map((p) => [p.key, p.priceKurus])).toEqual([
      ['monthly', 9999],
      ['yearly', 79999],
    ]);
  });

  it('biçim ve türetilenler', () => {
    expect(formatTry(3999)).toBe('39,99 TL');
    expect(formatTry(24999)).toBe('249,99 TL');
    expect(CREDIT_PACKAGES.map(perCreditKurus)).toEqual([400, 333, 250]);
    expect(yearlyFreeMonths()).toBe(4);
  });
});
