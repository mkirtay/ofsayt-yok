import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { shouldMarkUnresolved } from './predictionRecords';

const now = new Date('2026-09-29T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60_000);

describe('shouldMarkUnresolved', () => {
  it('geçici hata asla kapatmaz (kota tükenince kayıt kaybolmasın)', () => {
    expect(shouldMarkUnresolved({ lookup: 'error', createdAt: daysAgo(30) }, now)).toBe(false);
  });

  it('Sportmonks\'ta yok / eski id: kayıt 3 günden eskiyse kapatır', () => {
    expect(shouldMarkUnresolved({ lookup: 'missing', createdAt: daysAgo(2) }, now)).toBe(false);
    expect(shouldMarkUnresolved({ lookup: 'missing', createdAt: daysAgo(4) }, now)).toBe(true);
    expect(shouldMarkUnresolved({ lookup: 'legacy', createdAt: daysAgo(4) }, now)).toBe(true);
  });

  it('maç var ama değerlendirilemiyor: maç gününden 3 gün sonra (analiz günler önce üretilmiş olabilir)', () => {
    // Analiz 10 gün önce, maç 2 gün önce ertelendi → henüz kapatma.
    expect(shouldMarkUnresolved({ lookup: 'found', createdAt: daysAgo(10), matchDate: '2026-09-27' }, now)).toBe(false);
    // Maç günü 2026-09-25 → gün sonu 26'sı 00:00 → 3 gün + 12 sa geçti.
    expect(shouldMarkUnresolved({ lookup: 'found', createdAt: daysAgo(10), matchDate: '2026-09-25' }, now)).toBe(true);
  });

  it('maç tarihi yoksa kayıt tarihine bakar', () => {
    expect(shouldMarkUnresolved({ lookup: 'found', createdAt: daysAgo(5), matchDate: null }, now)).toBe(true);
  });
});
