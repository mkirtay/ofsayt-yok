import { describe, expect, it } from 'vitest';
import { clampDescription, istanbulIsoDateTime, META_DESCRIPTION_MAX } from './seoText';

describe('clampDescription', () => {
  it('kısa metne dokunmaz (boşlukları sadeleştirir)', () => {
    expect(clampDescription('  Kısa   metin. ')).toBe('Kısa metin.');
  });

  it('uzun metni sınırın içindeki son cümlede keser', () => {
    const first = 'Galatasaray - Samsunspor (Süper Lig) maçı 21 Kasım 2026 Cumartesi, saat 16:00 (TSİ) TOD ekranlarında oynanacak.';
    const out = clampDescription(`${first} Muhtemel kadrolar, son form, karşılıklı maçlar ve AI maç analizi burada.`);
    expect(out).toBe(first);
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('cümle sonu yoksa kelime sınırında keser ve üç nokta koyar', () => {
    const out = clampDescription(`${'kelime '.repeat(40)}son`, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});

describe('istanbulIsoDateTime', () => {
  it('UTC anını TSİ ofsetli ISO tarih-saate çevirir', () => {
    expect(istanbulIsoDateTime(Date.UTC(2026, 10, 21, 13, 0))).toBe('2026-11-21T16:00:00+03:00');
  });

  it("gün sınırını TSİ'ye göre kaydırır", () => {
    expect(istanbulIsoDateTime(Date.UTC(2026, 10, 21, 22, 30))).toBe('2026-11-22T01:30:00+03:00');
  });
});
