import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { sortAssistantMatches } from './matchOrder';

const m = (id: number, league: number, home: number, away: number, ts = 0): Match =>
  ({ id, competition_id: league, home: { id: home, name: `H${home}` }, away: { id: away, name: `A${away}` }, scheduled: '', date: '', kickoff_ts: ts }) as unknown as Match;

describe('sortAssistantMatches', () => {
  it('büyük Türk takımı > Süper Lig > UEFA > büyük 5 > 1. lig > alt lig', () => {
    const list = [
      m(1, 1282, 9001, 9002), // TFF 2. Lig
      m(2, 8, 1, 2), // Premier League
      m(3, 600, 500, 501), // Süper Lig
      m(4, 2, 34, 9003), // GS Şampiyonlar Ligi
      m(5, 2, 7000, 7001), // UEFA
      m(6, 271, 8000, 8001), // diğer 1. lig
    ];
    expect(sortAssistantMatches(list).map((x) => x.id)).toEqual([4, 3, 5, 2, 6, 1]);
  });
  it('aynı kademede Avrupa devi olan maç önce', () => {
    const list = [m(1, 564, 100, 101), m(2, 564, 83, 102)];
    expect(sortAssistantMatches(list).map((x) => x.id)).toEqual([2, 1]);
  });
});
