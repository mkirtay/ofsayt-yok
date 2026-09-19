import { describe, it, expect, vi, beforeEach } from 'vitest';

const { scope, sentry } = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setLevel: vi.fn(), setExtras: vi.fn(), setFingerprint: vi.fn() };
  const sentry = {
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
  };
  return { scope, sentry };
});
vi.mock('@sentry/nextjs', () => sentry);

import { reportSportmonksQuota, classifyQuota, resetQuotaAlertThrottle, SPORTMONKS_POOL_LIMIT } from './quotaMonitor';

const obs = (remaining: number, pool = 'Fixture') => ({ pool, remaining, resetsInSeconds: 1200, path: '/livescores/inplay' });

describe('Sportmonks kota → Sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQuotaAlertThrottle();
  });

  it('eşik sınıflandırması: %10 altı warning, %2 altı error', () => {
    expect(classifyQuota(SPORTMONKS_POOL_LIMIT * 0.1)).toBe('ok'); // tam eşik = henüz uyarı yok
    expect(classifyQuota(249)).toBe('warning');
    expect(classifyQuota(49)).toBe('error');
  });

  it('sağlıklı kotada yalnızca havuz adlı breadcrumb gönderir, event üretmez', () => {
    reportSportmonksQuota(obs(2400, 'League'));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'sportmonks.quota', data: expect.objectContaining({ pool: 'League', remaining: 2400 }) }),
    );
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('%10 altında havuz tag\'li WARNING event\'i üretir', () => {
    reportSportmonksQuota(obs(200, 'Fixture'));
    expect(scope.setTag).toHaveBeenCalledWith('sportmonks.pool', 'Fixture');
    expect(scope.setTag).toHaveBeenCalledWith('sportmonks.quota_level', 'warning');
    expect(scope.setLevel).toHaveBeenCalledWith('warning');
    expect(sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('Fixture'), 'warning');
    expect(scope.setExtras).toHaveBeenCalledWith(expect.objectContaining({ remaining: 200, limit: 2500, threshold: 250 }));
  });

  it('%2 altında ERROR seviyesine çıkar', () => {
    reportSportmonksQuota(obs(30, 'Standing'));
    expect(scope.setLevel).toHaveBeenCalledWith('error');
    expect(sentry.captureMessage).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('aynı havuz+seviye için throttle süresi içinde tekrar event üretmez, süre dolunca üretir', () => {
    reportSportmonksQuota(obs(200), 1_000);
    reportSportmonksQuota(obs(190), 30_000);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    reportSportmonksQuota(obs(180), 70_000);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    reportSportmonksQuota(obs(100, 'Topscorer'), 30_000); // farklı havuz bağımsız
    expect(sentry.captureMessage).toHaveBeenCalledTimes(3);
  });
});
