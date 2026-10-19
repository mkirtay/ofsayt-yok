import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { candidatesIn, pickDaily, rankWeekly } from './selection';

const NOW = new Date('2026-10-24T09:00:00Z');
const START = new Date('2026-10-23T21:00:00Z');
const END = new Date('2026-10-24T21:00:00Z');

const m = (id: number, hhmm: string, league: number, homeId = 1000 + id, awayId = 2000 + id, over: Partial<Match> = {}): Match =>
  ({ id, date: '2026-10-24', scheduled: hhmm, status: 'NOT STARTED', competition_id: league, home: { id: homeId, name: `H${id}` }, away: { id: awayId, name: `A${id}` }, ...over }) as Match;

describe('günlük seçim (Günün 3 maçı)', () => {
  it('kademe: Süper Lig → büyük 5 → Avrupa kupaları → alt seviye; kademe içinde büyük takım önce', () => {
    const c = candidatesIn([m(1, '18:00', 603), m(2, '17:00', 2), m(3, '19:00', 8), m(4, '16:00', 600), m(5, '15:00', 8, 8, 19)], START, END, NOW);
    expect(pickDaily(c).map((x) => x.fixtureId)).toEqual(['4', '5', '3']); // Süper Lig, LIV–ARS (büyük), PL; kupa ve 1. Lig dışarıda
  });

  it('üst kademe yetmezse alt seviyeden tamamlanır; kademe dışı ligler en sonda', () => {
    const c = candidatesIn([m(1, '18:00', 999), m(2, '17:00', 72), m(3, '19:00', 603)], START, END, NOW);
    expect(pickDaily(c).map((x) => x.fixtureId)).toEqual(['2', '3', '1']);
  });

  it('başlamış, saati belirsiz, durum kodlu ya da gün dışı maçlar aday değil; tekrar eden fixture tek', () => {
    const c = candidatesIn(
      [m(1, '08:00', 600), m(2, '12:00', 600, 1, 2, { time_tbd: true } as Partial<Match>), m(3, '12:00', 600, 1, 2, { state_code: 'POSTPONED' } as Partial<Match>), m(4, '22:00', 600, 1, 2, { date: '2026-10-24' }), m(5, '12:00', 600), m(5, '12:00', 600)],
      START,
      END,
      NOW,
    );
    expect(c.map((x) => x.fixtureId)).toEqual(['5']);
    expect(pickDaily([])).toEqual([]);
  });

  it('haftalık öneri sırası: derbi (iki büyük takım) en önde, sonra tek büyük, sonra lig önceliği', () => {
    const c = candidatesIn([m(1, '12:00', 600), m(2, '13:00', 2, 3468, 1), m(3, '14:00', 600, 34, 88), m(4, '11:00', 8)], START, END, NOW);
    expect(rankWeekly(c).map((x) => [x.fixtureId, x.big])).toEqual([['3', 2], ['2', 1], ['1', 0], ['4', 0]]);
  });
});
