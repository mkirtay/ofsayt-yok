/** Gündem 1. sıra: hafta sınırı (Pazartesi 01:00 İstanbul) ve başlayan gün oranında kesinti — saf hesaplar. */
import { describe, expect, it } from 'vitest';
import { minimumBid, pinCharge, pinWeekEnd, pinWeekStart } from './pinBid';

const H = 3_600_000;
const D = 24 * H;

describe('pinWeekStart', () => {
  it('Pazartesi 01:00 İstanbul = Pazar 22:00 UTC', () => {
    // 2026-10-19 Pazartesi
    expect(pinWeekStart(new Date('2026-10-21T12:00:00Z')).toISOString()).toBe('2026-10-18T22:00:00.000Z');
  });
  it('Pazartesi 00:59 İstanbul hâlâ önceki hafta; 01:00 yeni hafta', () => {
    expect(pinWeekStart(new Date('2026-10-18T21:59:00Z')).toISOString()).toBe('2026-10-11T22:00:00.000Z');
    expect(pinWeekStart(new Date('2026-10-18T22:00:00Z')).toISOString()).toBe('2026-10-18T22:00:00.000Z');
  });
  it('Pazar gecesi İstanbul (UTC Pazar 21:00) önceki haftada; hafta sonu = başlangıç + 7 gün', () => {
    const s = pinWeekStart(new Date('2026-10-25T21:00:00Z'));
    expect(s.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(pinWeekEnd(s).toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });
});

describe('pinCharge (başlayan gün, kesinti yukarı)', () => {
  const t0 = new Date('2026-10-20T10:00:00Z');
  const at = (ms: number) => new Date(t0.getTime() + ms);
  it('7 kredi, 1 saat → 1 gün: 1 alınır, 6 iade', () => {
    expect(pinCharge(7, t0, at(H))).toEqual({ days: 1, charged: 1, refunded: 6 });
  });
  it('7 kredi, 24 saat 1 dk → 2 gün', () => {
    expect(pinCharge(7, t0, at(D + 60_000))).toEqual({ days: 2, charged: 2, refunded: 5 });
  });
  it('1 kredi her durumda 1 alınır (yukarı yuvarlama), iade yok', () => {
    expect(pinCharge(1, t0, at(1000))).toEqual({ days: 1, charged: 1, refunded: 0 });
  });
  it('10 kredi, 3 gün → ceil(30/7)=5 alınır, 5 iade', () => {
    expect(pinCharge(10, t0, at(3 * D))).toEqual({ days: 3, charged: 5, refunded: 5 });
  });
  it('en çok 7 gün; anında (0 ms) da 1 gün sayılır', () => {
    expect(pinCharge(14, t0, at(9 * D))).toEqual({ days: 7, charged: 14, refunded: 0 });
    expect(pinCharge(14, t0, t0)).toEqual({ days: 1, charged: 2, refunded: 12 });
  });
});

describe('minimumBid', () => {
  it('boş sıra 1, lider varken +1', () => {
    expect(minimumBid(null)).toBe(1);
    expect(minimumBid(5)).toBe(6);
  });
});
