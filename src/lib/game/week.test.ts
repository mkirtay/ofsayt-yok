import { describe, expect, it } from 'vitest';
import { isInWeek, isSeasonKey, isWeekKey, seasonOf, shiftWeek, weekKeyOf, weekRange } from './week';

const at = (iso: string) => Date.parse(iso);

describe('tahmin oyunu haftası (TR, Pzt 00:00 – Paz 23:59)', () => {
  it('hafta sınırı TR saatine göre: Pazar 23:59 TSİ önceki hafta, Pazartesi 00:00 TSİ yeni hafta', () => {
    // 2026-10-11 Pazar; 2026-10-12 Pazartesi (ISO hafta 42)
    expect(weekKeyOf(at('2026-10-11T20:59:59Z'))).toBe('2026-W41'); // Paz 23:59:59 TSİ
    expect(weekKeyOf(at('2026-10-11T21:00:00Z'))).toBe('2026-W42'); // Pzt 00:00 TSİ
    expect(weekKeyOf(at('2026-10-18T20:59:59Z'))).toBe('2026-W42');
  });

  it('weekRange: UTC sınırları Pazar 21:00 UTC', () => {
    expect(weekRange('2026-W42')).toEqual({ startsAt: new Date('2026-10-11T21:00:00Z'), endsAt: new Date('2026-10-18T21:00:00Z') });
    const r = weekRange('2026-W42')!;
    expect(weekKeyOf(r.startsAt.getTime())).toBe('2026-W42');
    expect(weekKeyOf(r.endsAt.getTime() - 1)).toBe('2026-W42');
    expect(weekKeyOf(r.endsAt.getTime())).toBe('2026-W43');
  });

  it('yıl dönümü: ISO kuralı (Perşembe yılı belirler)', () => {
    // 2026-12-28 Pzt … 2027-01-03 Paz = 2026-W53 (2026 Perşembe ile başladığı için 53 hafta)
    expect(weekKeyOf(at('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(weekKeyOf(at('2027-01-04T12:00:00Z'))).toBe('2027-W01');
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
    expect(isWeekKey('2027-W53')).toBe(false); // 2027'de 52 hafta
  });

  it('anahtar doğrulama', () => {
    for (const bad of ['2026-42', '2026-W0', '2026-W00', '2026-W54', '2025-W10', 'x', 42, null]) expect(isWeekKey(bad)).toBe(false);
    expect(isWeekKey('2026-W42')).toBe(true);
  });

  it('sezon Temmuz–Haziran', () => {
    expect(seasonOf('2026-W42')).toBe('2026-27');
    expect(seasonOf('2027-W20')).toBe('2026-27');
    expect(seasonOf('2027-W28')).toBe('2027-28');
    expect(isSeasonKey('2026-27')).toBe(true);
    expect(isSeasonKey('2026-28')).toBe(false);
  });

  it('isInWeek', () => {
    expect(isInWeek('2026-W42', new Date('2026-10-17T18:00:00Z'))).toBe(true);
    expect(isInWeek('2026-W42', new Date('2026-10-19T18:00:00Z'))).toBe(false);
  });
});
