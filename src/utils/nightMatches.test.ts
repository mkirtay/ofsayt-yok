import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { isNightMatchOf, NIGHT_END_HOUR, nightDateOf, selectNightMatches } from './nightMatches';

const m = (id: number, date: string, scheduled: string) => ({ id, status: 'NOT STARTED', date, scheduled }) as unknown as Match;

describe('gece maçları (ertesi TR günü 00:00–06:00)', () => {
  it('sınırlar: 00:00 dahil, 06:00 hariç (UTC+3)', () => {
    expect(NIGHT_END_HOUR).toBe(6);
    expect(nightDateOf('2026-10-02')).toBe('2026-10-03');
    expect(isNightMatchOf(m(1, '2026-10-02', '21:00'), '2026-10-02')).toBe(true); // 3 Ekim 00:00
    expect(isNightMatchOf(m(1, '2026-10-02', '20:59'), '2026-10-02')).toBe(false); // 2 Ekim 23:59 → günün kendisi
    expect(isNightMatchOf(m(1, '2026-10-03', '02:59'), '2026-10-02')).toBe(true); // 05:59
    expect(isNightMatchOf(m(1, '2026-10-03', '03:00'), '2026-10-02')).toBe(false); // 06:00
  });

  it('saati bilinmeyen maç gece maçı sayılmaz; ay ve yıl geçişi', () => {
    expect(isNightMatchOf({ id: 1, date: '2026-10-03' } as unknown as Match, '2026-10-02')).toBe(false);
    expect(isNightMatchOf(m(1, '2026-10-31', '22:00'), '2026-10-31')).toBe(true); // 1 Kasım 01:00
    expect(isNightMatchOf(m(1, '2026-12-31', '23:30'), '2026-12-31')).toBe(true); // 1 Ocak 02:30
  });

  it('seçim: id tekil, sıra korunur, başka günler elenir', () => {
    const list = [m(3, '2026-10-02', '23:00'), m(9, '2026-10-02', '12:00'), m(3, '2026-10-02', '23:00'), m(4, '2026-10-03', '00:30')];
    expect(selectNightMatches(list, '2026-10-02').map((x) => x.id)).toEqual([3, 4]);
  });
});
