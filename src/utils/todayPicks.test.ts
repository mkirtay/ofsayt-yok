import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { selectTodayPicks, superLigMatches, todayPickTier, TODAY_PICKS_MAX } from './todayPicks';

function m(id: number, league: number, home: number, away: number, scheduled = '18:00'): Match {
  return {
    id,
    status: 'NOT STARTED',
    time: '',
    date: '2026-10-21',
    scheduled,
    home: { id: home, name: `T${home}` },
    away: { id: away, name: `T${away}` },
    competition: { id: league, name: `L${league}` },
  };
}

const GS = 34;
const FB = 88;
const BJK = 554;
const KASIMPASA = 2500;
const ctx = { turkishTeamIds: new Set([GS, FB, BJK, KASIMPASA]), derbyMatchIds: new Set([3]) };

describe('todayPickTier', () => {
  it('Avrupa kupasında Türk takımı (UCL/UEL/UECL) > derbi > Süper Lig > ŞL > büyük 5; diğerleri yok', () => {
    expect(todayPickTier(m(1, 2, 9, GS), ctx)).toBe('turkishInEurope');
    expect(todayPickTier(m(2, 2286, BJK, 500), ctx)).toBe('turkishInEurope');
    expect(todayPickTier(m(3, 600, GS, FB), ctx)).toBe('derby');
    expect(todayPickTier(m(4, 600, GS, KASIMPASA), ctx)).toBe('superLig');
    expect(todayPickTier(m(5, 2, 9, 10), ctx)).toBe('championsLeague');
    expect(todayPickTier(m(6, 5, 9, 10), ctx)).toBeNull(); // Türk takımı olmayan Avrupa Ligi
    expect(todayPickTier(m(7, 8, 9, 10), ctx)).toBe('bigFive');
    expect(todayPickTier(m(8, 603, 1, 2), ctx)).toBeNull(); // 1. Lig
    expect(todayPickTier({ ...m(9, 600, 1, 2), competition: undefined }, ctx)).toBeNull();
  });
});

describe('selectTodayPicks', () => {
  it('kademe sırası, kademe içinde başlama saati; en çok 6', () => {
    const list = [
      m(10, 8, 20, 21, '19:00'), // büyük 5 (PL)
      m(11, 564, 22, 23, '18:00'), // büyük 5 (La Liga)
      m(12, 2, 24, 25, '19:00'), // ŞL
      m(13, 600, KASIMPASA, 26, '17:00'), // Süper Lig
      m(3, 600, GS, FB, '16:00'), // derbi
      m(14, 5, FB, 27, '20:00'), // Avrupa'da Türk takımı (geç saat)
      m(15, 2, GS, 28, '16:45'), // Avrupa'da Türk takımı (erken)
      m(16, 82, 29, 30, '13:30'), // büyük 5 (Bundesliga)
      m(17, 1282, 31, 32), // 2. Lig → yok
    ];
    const picks = selectTodayPicks(list, ctx);
    expect(picks.map((p) => p.match.id)).toEqual([15, 14, 3, 13, 12, 10]);
    expect(picks).toHaveLength(TODAY_PICKS_MAX);
    expect(picks.map((p) => p.tier)).toEqual(['turkishInEurope', 'turkishInEurope', 'derby', 'superLig', 'championsLeague', 'bigFive']);
  });

  it('büyük 5 içinde lig sırası (PL → La Liga → Bundesliga …), sonra saat; tekrar eden id tekil', () => {
    const picks = selectTodayPicks([m(1, 82, 1, 2, '12:00'), m(2, 8, 3, 4, '20:00'), m(3, 8, 5, 6, '14:00'), m(3, 8, 5, 6, '14:00'), m(4, 564, 7, 8)], {
      turkishTeamIds: new Set(),
      derbyMatchIds: new Set(),
    });
    expect(picks.map((p) => p.match.id)).toEqual([3, 2, 4, 1]);
  });

  it('öne çıkan maç yoksa boş', () => {
    expect(selectTodayPicks([m(1, 603, 1, 2), m(2, 1282, 3, 4)], ctx)).toEqual([]);
  });

  it('derbi kontrolü yalnız Süper Lig maçlarına', () => {
    expect(superLigMatches([m(1, 600, 1, 2), m(2, 8, 3, 4)]).map((x) => x.id)).toEqual([1]);
  });
});
