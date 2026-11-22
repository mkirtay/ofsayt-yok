import { describe, expect, it } from 'vitest';
import { aggregateRefereeSplits, toWeekFixture, type WeekFixture } from './leagueWeeks';

const fx = (id: number, refId: number, score: string, hy: number, ay: number, r = 0): WeekFixture => ({
  id,
  href: `/matches/${id}`,
  kickoff: 0,
  home: { id: 1, name: 'A', logo: null },
  away: { id: 2, name: 'B', logo: null },
  score,
  state: 'FT',
  referee: { id: refId, name: 'Hakem' },
  cards: { yellow: hy + ay, red: r },
  cardsBySide: { home: { yellow: hy, red: r }, away: { yellow: ay, red: 0 } },
});

describe('hakem karnesi (büyüme raporu 2.1)', () => {
  it('maç başına sarı, ev–dep. sarı, kırmızı, sonuç dağılımı; aynı maç bir kez', () => {
    const s = aggregateRefereeSplits([fx(1, 9, '2-0', 1, 3), fx(2, 9, '1-1', 2, 2, 1), fx(2, 9, '1-1', 2, 2, 1), fx(3, 9, '0-1', 3, 1)]).get(9)!;
    expect(s).toEqual({
      refereeId: 9,
      matches: 3,
      yellowPerMatch: 4,
      homeYellowPerMatch: 2,
      awayYellowPerMatch: 2,
      redPerMatch: 0.33,
      homeWinPct: 33,
      drawPct: 33,
      awayWinPct: 33,
    });
  });

  it('skorsuz / kart verisiz maç sayılmaz', () => {
    expect(aggregateRefereeSplits([{ ...fx(1, 9, '2-0', 1, 1), score: null }, { ...fx(2, 9, '1-0', 1, 1), cardsBySide: null }]).size).toBe(0);
  });

  it('istatistik satırları takım konumuna göre ayrılır', () => {
    const f = toWeekFixture({
      id: 5,
      participants: [
        { id: 1, name: 'A', meta: { location: 'home' } },
        { id: 2, name: 'B', meta: { location: 'away' } },
      ],
      statistics: [
        { type_id: 84, location: 'home', data: { value: 2 } },
        { type_id: 84, location: 'away', data: { value: 3 } },
        { type_id: 83, location: 'away', data: { value: 1 } },
      ],
    } as never)!;
    expect(f.cardsBySide).toEqual({ home: { yellow: 2, red: 0 }, away: { yellow: 3, red: 1 } });
    expect(f.cards).toEqual({ yellow: 5, red: 1 });
  });
});
