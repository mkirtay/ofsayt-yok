import { describe, expect, it } from 'vitest';
import { breakdownsBySeason, summaryContextRow, weightedRates } from './refereePage';
import type { SportmonksFixture } from '@/services/sportmonks/types';

const line = (seasonName: string, leagueId: number, matches: number, yellow: number | null, varPm: number | null = null) => ({
  seasonId: 1, seasonName, leagueId, startingAt: null, matches, yellowPerMatch: yellow, redPerMatch: 0, penaltiesPerMatch: 0.5, foulsPerMatch: 25, varPerMatch: varPm,
});

describe('hakem sayfası özet / kırılım yardımcıları', () => {
  it('maç ağırlıklı ortalama; değeri olmayan satır pay ve paydadan düşer', () => {
    expect(weightedRates([line('a', 600, 4, 3.5, null), line('a', 600, 12, 5, 0.5)])).toEqual({ yellow: 4.63, red: 0, penalties: 0.5, var: 0.5 });
    expect(weightedRates([])).toEqual({ yellow: null, red: null, penalties: null, var: null });
  });

  it('özet bağlamı: en son sezon adındaki en çok maçlı lig', () => {
    const rows = [line('2026/2027', 606, 1, 4), line('2026/2027', 600, 4, 3.5), line('2025/2026', 600, 15, 5)];
    expect(summaryContextRow(rows)).toMatchObject({ seasonName: '2026/2027', leagueId: 600, matches: 4 });
    expect(summaryContextRow([])).toBeNull();
  });

  it('kırılım sezon adına göre (aynı sezonun ligleri birlikte), yalnız biten maçlar; varsayılan güncel sezon, yoksa en son', () => {
    const fx = (id: number, season_id: number, state_id = 5) =>
      ({ id, season_id, state_id, participants: [{ id: 34, name: 'GS' }, { id: 88, name: 'FB' }], events: [] }) as unknown as SportmonksFixture;
    const names = new Map([[28203, '2026/2027'], [28300, '2026/2027'], [25682, '2025/2026']]);
    const r = breakdownsBySeason([fx(1, 28203), fx(2, 28300), fx(3, 25682), fx(4, 28203, 1), fx(5, 99999)], names, '2026/2027');
    expect(r.seasons.map((s) => [s.seasonName, s.matchCount])).toEqual([['2026/2027', 2], ['2025/2026', 1]]);
    expect(r.defaultSeason).toBe('2026/2027');
    expect(breakdownsBySeason([fx(3, 25682)], names, '2026/2027').defaultSeason).toBe('2025/2026');
  });
});
