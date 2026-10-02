import { describe, expect, it } from 'vitest';
import mls from './sportmonks/__fixtures__/standingsGrouped.779.json';
import arg from './sportmonks/__fixtures__/standingsGrouped.636.json';
import { buildStandingsData, type SportmonksStandingRowWithGroup } from './competitionStandings';

// Gerçek yanıtlardan (2026-10-02) her grubun ilk satırları: MLS 26720 (Batı/Doğu konferansı × 3),
// Arjantin 26808 (Apertura bitti, Clausura güncel × Grup A/B × 2).
const rowsOf = (x: unknown) => x as SportmonksStandingRowWithGroup[];

describe('buildStandingsData', () => {
  it('MLS: iki konferans ayrı grup, her birinde sıra 1\'den', () => {
    const d = buildStandingsData(rowsOf(mls), 779, 26720);
    expect(d.table).toBeUndefined();
    expect(d.stages).toHaveLength(1);
    const groups = d.stages![0]!.groups!;
    expect(groups.map((g) => g.name)).toEqual(['Eastern Conference', 'Western Conference']);
    for (const g of groups) expect(g.standings!.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(groups[1]!.standings![0]).toMatchObject({ rank: 1, name: expect.any(String), matches: expect.any(Number) });
  });

  it('Arjantin: güncel aşama (Clausura) önce, her aşamada Grup A/B ayrı, sıra 1\'den', () => {
    const d = buildStandingsData(rowsOf(arg), 636, 26808);
    expect(d.stages!.map((s) => s.stage?.name)).toEqual(['Clausura', 'Apertura']);
    for (const s of d.stages!) {
      expect(s.groups!.map((g) => g.name)).toEqual(['Group A', 'Group B']);
      for (const g of s.groups!) expect(g.standings!.map((r) => r.rank)).toEqual([1, 2]);
    }
  });

  it('tek grup + tek aşama: eskisi gibi düz tablo (sıralı)', () => {
    const west = rowsOf(mls).filter((r) => r.group?.name === 'Western Conference').reverse();
    const d = buildStandingsData(west, 779, 26720);
    expect(d.stages).toBeUndefined();
    expect(d.table!.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('group_id filtresi tek grubu düz tablo olarak verir', () => {
    const gid = rowsOf(mls)[0]!.group_id!;
    const d = buildStandingsData(rowsOf(mls), 779, 26720, gid);
    expect(d.table).toHaveLength(3);
  });
});
