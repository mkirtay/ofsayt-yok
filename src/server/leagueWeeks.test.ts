import { describe, expect, it } from 'vitest';
import { pickCurrentRound, toSeasonRounds, toWeekFixture } from './leagueWeeks';

describe('leagueWeeks', () => {
  it('hafta listesi: sayısal ada göre sıralı, sayısal olmayan ad atlanır', () => {
    const r = toSeasonRounds([
      { id: 3, name: '10', finished: false },
      { id: 1, name: '2', finished: true },
      { id: 9, name: 'Final' },
    ]);
    expect(r.map((x) => x.week)).toEqual([2, 10]);
  });

  it('maç: ev/deplasman, CURRENT skoru, orta hakem (type 6), kanonik maç adresi', () => {
    const f = toWeekFixture({
      id: 19745050,
      starting_at: '2026-08-24 18:30:00',
      participants: [
        { id: 2, name: 'Amed SK', meta: { location: 'away' } },
        { id: 1, name: 'Kocaelispor', meta: { location: 'home' } },
      ],
      scores: [
        { description: '1ST_HALF', score: { goals: 1, participant: 'home' } },
        { description: 'CURRENT', score: { goals: 3, participant: 'home' } },
        { description: 'CURRENT', score: { goals: 0, participant: 'away' } },
      ],
      state: { developer_name: 'FT' },
      referees: [
        { type_id: 7, referee: { id: 5, display_name: 'Yardımcı' } },
        { type_id: 6, referee: { id: 9, display_name: 'Ümit Öztürk' } },
      ],
    })!;
    expect(f.score).toBe('3-0');
    expect(f.referee).toEqual({ id: 9, name: 'Ümit Öztürk' });
    expect(f.home.name).toBe('Kocaelispor');
    expect(f.href).toMatch(/^\/matches\/19745050-/);
    expect(f.kickoff).toBe(Date.parse('2026-08-24T18:30:00Z'));
  });

  it('varsayılan hafta: is_current, yoksa bitmemiş ilk hafta', () => {
    const rounds = toSeasonRounds([
      { id: 1, name: '1', ending_at: '2026-08-10', finished: true },
      { id: 2, name: '2', ending_at: '2026-08-17' },
      { id: 3, name: '3', ending_at: '2026-08-24' },
    ]);
    expect(pickCurrentRound(rounds, '2026-08-15')!.week).toBe(2);
    expect(pickCurrentRound(rounds, '2027-01-01')!.week).toBe(3);
  });
});
