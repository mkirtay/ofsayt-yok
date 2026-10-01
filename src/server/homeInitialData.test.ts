import { describe, expect, it } from 'vitest';
import { homeRevalidateSeconds, secondsUntilIstanbulMidnight } from './homeInitialData';

// 2026-10-04 12:00 TR = 09:00 UTC
const NOON_TR = Date.parse('2026-10-04T09:00:00Z');

const m = (status: string, scheduled: string, date = '2026-10-04') => ({ status, date, scheduled });

describe('homeRevalidateSeconds', () => {
  it('canlı maç → 120 sn', () => {
    expect(homeRevalidateSeconds([m('IN PLAY', '08:30')], NOON_TR)).toBe(120);
  });

  it('15 dk içinde başlayacak maç → 120 sn', () => {
    expect(homeRevalidateSeconds([m('NOT STARTED', '09:10')], NOON_TR)).toBe(120);
  });

  it('maç yok / hepsi bitmiş → 600 sn', () => {
    expect(homeRevalidateSeconds([], NOON_TR)).toBe(600);
    expect(homeRevalidateSeconds([m('FINISHED', '06:00')], NOON_TR)).toBe(600);
  });

  it('sıradaki maçın aktif penceresine 600 sn\'den az varsa o ana kadar (en az 120)', () => {
    // Başlama 09:20 UTC → aktif pencere 09:05 → 300 sn.
    expect(homeRevalidateSeconds([m('NOT STARTED', '09:20')], NOON_TR)).toBe(300);
    // Pencereye 60 sn → 120'nin altına inmez.
    expect(homeRevalidateSeconds([m('NOT STARTED', '09:16')], NOON_TR)).toBe(120);
  });

  it('TR gece yarısını geçmez (en az 30 sn)', () => {
    const fiveMinBeforeMidnight = Date.parse('2026-10-04T20:55:00Z'); // 23:55 TR
    expect(homeRevalidateSeconds([], fiveMinBeforeMidnight)).toBe(305);
    const tenSecBefore = Date.parse('2026-10-04T20:59:50Z');
    expect(homeRevalidateSeconds([], tenSecBefore)).toBe(30);
  });
});

describe('secondsUntilIstanbulMidnight', () => {
  it('TR 12:00 → 12 saat', () => {
    expect(secondsUntilIstanbulMidnight(NOON_TR)).toBe(12 * 3600);
  });
});
