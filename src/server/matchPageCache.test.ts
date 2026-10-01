import { describe, it, expect } from 'vitest';
import { matchPageCacheControl, matchPageCacheControlForMatch, matchPageCacheKindForStatus } from './matchPageCache';
import { isUnambiguousSportmonksId } from '@/services/sportmonks/fixtureIdRange';

describe('matchPageCache', () => {
  it('maç durumuna göre s-maxage', () => {
    expect(matchPageCacheControl(matchPageCacheKindForStatus('IN PLAY'))).toContain('s-maxage=30,');
    expect(matchPageCacheControl(matchPageCacheKindForStatus('HALF TIME BREAK'))).toContain('s-maxage=30,');
    expect(matchPageCacheControl(matchPageCacheKindForStatus('NOT STARTED'))).toContain('s-maxage=300,');
    expect(matchPageCacheControl(matchPageCacheKindForStatus('FINISHED'))).toContain('s-maxage=86400,');
    expect(matchPageCacheControl('gone')).toContain('s-maxage=86400,');
  });

  it('başlamamış maç: başlamaya 15 dk kalana kadar en çok 5 dk, aktif pencerede 30 sn', () => {
    const now = Date.parse('2026-10-04T12:00:00Z');
    const m = (scheduled: string, status = 'NOT STARTED') => ({ status, date: '2026-10-04', scheduled });
    expect(matchPageCacheControlForMatch(m('18:00'), now)).toContain('s-maxage=300,');
    // 12:20 başlama → aktif pencere 12:05 → 300 sn (tam sınır)
    expect(matchPageCacheControlForMatch(m('12:19'), now)).toContain('s-maxage=240,');
    expect(matchPageCacheControlForMatch(m('12:10'), now)).toContain('s-maxage=30,');
    // Saati geçmiş ama durum güncellenmemiş
    expect(matchPageCacheControlForMatch(m('11:30'), now)).toContain('s-maxage=30,');
    expect(matchPageCacheControlForMatch(m('11:30', 'FINISHED'), now)).toContain('s-maxage=86400,');
    expect(matchPageCacheControlForMatch(m('11:30', 'IN PLAY'), now)).toContain('s-maxage=30,');
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
