import { describe, expect, it } from 'vitest';
import { pickStandings, standingsSentence } from './matchStandingsLine';

const row = (id: number, rank: number, points: number) => ({ rank, points, matches: 12, goal_diff: 0, won: 0, drawn: 0, lost: 0, team: { id, name: `T${id}` } });

describe('matchStandingsLine', () => {
  it('iki takım aynı tabloda: sıraya göre cümle', () => {
    const p = pickStandings([{ rows: [row(1, 9, 16), row(2, 6, 19)] }], { id: 1, name: 'Gaziantep F.K.' }, { id: 2, name: 'Kasımpaşa' })!;
    expect(standingsSentence({ leagueName: 'Süper Lig', leagueHref: '/lig/super-lig', ...p })).toBe(
      'Güncel Süper Lig puan durumunda Kasımpaşa 6. sırada (19 puan, 12 maç), Gaziantep F.K. 9. sırada (16 puan, 12 maç).',
    );
  });
  it('gruplu turnuva: ikisini birlikte içeren grup seçilir; tek takım bulunursa yalnız o', () => {
    const p = pickStandings([{ rows: [row(1, 1, 9)] }, { rows: [row(1, 2, 7), row(2, 3, 5)] }], { id: 1, name: 'A' }, { id: 2, name: 'B' })!;
    expect(p.home!.rank).toBe(2);
    const only = pickStandings([{ rows: [row(1, 1, 9)] }], { id: 1, name: 'A' }, { id: 3, name: 'C' })!;
    expect(standingsSentence({ leagueName: 'X', leagueHref: null, ...only })).toBe('Güncel X puan durumunda A 1. sırada (9 puan, 12 maç).');
    expect(pickStandings([{ rows: [row(5, 1, 1)] }], { id: 1, name: 'A' }, { id: 2, name: 'B' })).toBeNull();
  });
});
