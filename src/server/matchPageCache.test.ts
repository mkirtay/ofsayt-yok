import { describe, it, expect } from 'vitest';
import { matchPageCacheControl, matchPageCacheKindForStatus } from './matchPageCache';
import { isUnambiguousSportmonksId } from '@/services/sportmonks/fixtureIdRange';

describe('matchPageCache', () => {
  it('maç durumuna göre s-maxage', () => {
    expect(matchPageCacheControl(matchPageCacheKindForStatus('IN PLAY'))).toContain('s-maxage=30,');
    expect(matchPageCacheControl(matchPageCacheKindForStatus('HALF TIME BREAK'))).toContain('s-maxage=30,');
    expect(matchPageCacheControl(matchPageCacheKindForStatus('NOT STARTED'))).toContain('s-maxage=120,');
    expect(matchPageCacheControl(matchPageCacheKindForStatus('FINISHED'))).toContain('s-maxage=3600,');
    expect(matchPageCacheControl('gone')).toContain('s-maxage=86400,');
  });
});

describe('isUnambiguousSportmonksId', () => {
  it('eski livescore id aralığı (DB: 680.669–1.861.826) belirsiz bölgede', () => {
    expect(isUnambiguousSportmonksId('680669')).toBe(false);
    expect(isUnambiguousSportmonksId('1861826')).toBe(false);
    // Eski UEFA sezonlarının gerçek Sportmonks id'leri de aynı bölgede (GS–Real 2013).
    expect(isUnambiguousSportmonksId('1058753')).toBe(false);
  });

  it('güncel Sportmonks fixture id\'leri (≥19.1M) kesin', () => {
    expect(isUnambiguousSportmonksId('19135634')).toBe(true);
    expect(isUnambiguousSportmonksId(19873905)).toBe(true);
  });

  it('sayısal olmayan / boş id geçmez', () => {
    expect(isUnambiguousSportmonksId('abc')).toBe(false);
    expect(isUnambiguousSportmonksId('')).toBe(false);
    expect(isUnambiguousSportmonksId(null)).toBe(false);
    expect(isUnambiguousSportmonksId('19135634abc')).toBe(false);
  });
});
