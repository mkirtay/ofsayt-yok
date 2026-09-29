import { describe, it, expect } from 'vitest';
import { formatDayMonth, formatDayMonthLocative, pickNextMatchDays } from './nextMatchDay';

const entries = [
  { leagueId: 8, date: '2026-10-03' },
  { leagueId: 600, date: '2026-10-09' },
  { leagueId: 564, date: '2026-10-04' },
];

describe('nextMatchDay', () => {
  it('filtre yoksa en yakın tek gün; filtre varsa filtredeki ligler tarih sırasıyla', () => {
    expect(pickNextMatchDays(entries, null)).toEqual([{ leagueId: 8, date: '2026-10-03' }]);
    expect(pickNextMatchDays(entries, new Set([600]))).toEqual([{ leagueId: 600, date: '2026-10-09' }]);
    expect(pickNextMatchDays(entries, new Set([600, 8, 564])).map((e) => e.leagueId)).toEqual([8, 564, 600]);
    expect(pickNextMatchDays(entries, new Set([99999]))).toEqual([]);
  });

  it('Türkçe tarih + ay adına göre bulunma eki ("Süper Lig 9 Ekim\'de dönüyor")', () => {
    expect(formatDayMonth('2026-10-09', 'tr')).toBe('9 Ekim');
    expect(formatDayMonthLocative('2026-10-09', 'tr')).toBe("9 Ekim'de");
    expect(formatDayMonthLocative('2027-03-01', 'tr')).toBe("1 Mart'ta");
    expect(formatDayMonthLocative('2027-04-12', 'tr')).toBe("12 Nisan'da");
    expect(formatDayMonthLocative('2026-09-20', 'tr')).toBe("20 Eylül'de");
    expect(formatDayMonthLocative('2026-10-09', 'en')).toBe('9 October');
  });
});
