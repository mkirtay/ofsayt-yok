import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMBO_POOL, scorePoolMatch, selectPool, topTeamIdsFromTable, type PoolInput } from './comboPool';
import { isTrackedNationalLeague } from './nationalLeagues';

const t = (h: number, min = 0) => Date.parse(`2026-11-12T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+03:00`);
const club = (over: Partial<PoolInput> = {}): PoolInput => ({
  matchId: '1', leagueId: 600, national: false, homeTeamId: 1, awayTeamId: 2, homeName: 'A', awayName: 'B', kickoffMs: t(20), ...over,
});

describe('kapsam sabitleri analysisPregen ile uyumlu', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/server/analysisPregen.ts'), 'utf8');
  const arr = (name: string) => [...new RegExp(`${name} = \\[([^\\]]+)\\]`).exec(src)![1]!.matchAll(/\d+/g)].map((m) => Number(m[0]));
  it('Süper Lig / UEFA / büyük 5 / Türkiye ülke kimliği / ilk 6 eşiği aynı', () => {
    expect(Number(/SUPER_LIG = (\d+)/.exec(src)![1])).toBe(COMBO_POOL.superLig);
    expect(arr('UEFA_CLUB_LEAGUES').sort()).toEqual([...COMBO_POOL.uefaClubLeagues].sort());
    expect(arr('BIG_FIVE').sort()).toEqual([...COMBO_POOL.bigFive].sort());
    expect(Number(/TURKEY_COUNTRY_ID = (\d+)/.exec(src)![1])).toBe(COMBO_POOL.turkeyCountryId);
    expect(Number(/BIG_FIVE_TOP_RANK = (\d+)/.exec(src)![1])).toBe(COMBO_POOL.bigFiveTopRank);
  });
  it('milli turnuva kimlikleri izlenen milli ligler arasında', () => {
    for (const id of Object.keys(COMBO_POOL.nationalLeagueScores)) expect(isTrackedNationalLeague(Number(id))).toBe(true);
  });
});

describe('scorePoolMatch', () => {
  it('Süper Lig kapsamda; ilk 6 çifti ek puan; gece saati puan düşürür', () => {
    const plain = scorePoolMatch(club());
    expect(plain.inScope).toBe(true);
    const top = new Map([[600, new Set([1, 2])]]);
    expect(scorePoolMatch(club(), { topTeamsByLeague: top }).score).toBeGreaterThan(plain.score);
    const night = scorePoolMatch(club({ kickoffMs: t(1, 30) }));
    expect(night.score).toBe(plain.score - COMBO_POOL.score.nightPenalty);
    expect(night.reasons).toContain('night');
  });
  it('büyük 5: yalnız iki takım da ilk 6\'da ise kapsamda', () => {
    const top = new Map([[8, new Set([1, 2])]]);
    expect(scorePoolMatch(club({ leagueId: 8 }), { topTeamsByLeague: top }).inScope).toBe(true);
    expect(scorePoolMatch(club({ leagueId: 8, awayTeamId: 9 }), { topTeamsByLeague: top }).inScope).toBe(false);
    expect(scorePoolMatch(club({ leagueId: 8 })).inScope).toBe(false);
  });
  it('UEFA: kapsamda, Türk takımı bonus; kapsam dışı lig elenir', () => {
    const plain = scorePoolMatch(club({ leagueId: 5 }));
    const turk = scorePoolMatch(club({ leagueId: 5, homeCountryId: 404 }));
    expect(turk.score - plain.score).toBe(COMBO_POOL.score.turkeyBonus);
    expect(scorePoolMatch(club({ leagueId: 999 })).inScope).toBe(false);
  });
  it('milli: Uluslar Ligi kapsamda; Türkiye maçı her turnuvada kapsamda + bonus; hazırlık (diğer) elenir', () => {
    const nl = scorePoolMatch(club({ national: true, leagueId: 5, homeName: 'İtalya', awayName: 'Fransa' }));
    expect(nl.inScope).toBe(true);
    const tr = scorePoolMatch(club({ national: true, leagueId: 5, homeName: 'Türkiye', awayName: 'Belçika' }));
    expect(tr.score - nl.score).toBe(COMBO_POOL.score.turkeyBonus);
    expect(scorePoolMatch(club({ national: true, leagueId: 10, homeName: 'A', awayName: 'B' })).inScope).toBe(false);
    expect(scorePoolMatch(club({ national: true, leagueId: 10, homeName: 'Türkiye', awayName: 'B' })).inScope).toBe(true);
  });
});

describe('selectPool', () => {
  it('kapsam dışı elenir, puana göre sıralanır, en çok N', () => {
    const items: PoolInput[] = [
      club({ matchId: 'sl' }),
      club({ matchId: 'out', leagueId: 999 }),
      club({ matchId: 'ucl', leagueId: 2 }),
      club({ matchId: 'tr', national: true, leagueId: 5, homeName: 'Türkiye', awayName: 'Belçika' }),
      club({ matchId: 'night', kickoffMs: t(2) }),
    ];
    const pool = selectPool(items, {}, 3);
    expect(pool.map((p) => p.matchId)).toEqual(['tr', 'ucl', 'sl']);
    expect(selectPool(items).map((p) => p.matchId)).not.toContain('out');
    expect(selectPool(items, {}, 0)).toEqual([]);
  });
  it('varsayılan üst sınır 10', () => {
    const many = Array.from({ length: 15 }, (_, i) => club({ matchId: String(i) }));
    expect(selectPool(many)).toHaveLength(10);
  });
});

describe('topTeamIdsFromTable', () => {
  it('düz ve gruplu tablolardan ilk N', () => {
    expect([...topTeamIdsFromTable({ table: [{ rank: 1, team: { id: 5 } }, { rank: 7, team: { id: 6 } }] })]).toEqual([5]);
    expect([...topTeamIdsFromTable({ stages: [{ groups: [{ standings: [{ rank: 2, team_id: 9 }] }] }] })]).toEqual([9]);
    expect(topTeamIdsFromTable(null).size).toBe(0);
  });
});
