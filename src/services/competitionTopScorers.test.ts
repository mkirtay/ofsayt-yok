import { describe, expect, it } from 'vitest';
import fixture from './sportmonks/__fixtures__/topscorersWithAppearances.sl-28203.json';
import { appearancesFromRow, mapTopScorersWithAppearances, topscorerAppearanceFilters } from './competitionTopScorers';

// Gerçek yanıt (2026-10-02, Süper Lig 28203, tür 208, playerStatisticDetailTypes:321): ilk 3 golcü.
type Row = Parameters<typeof appearancesFromRow>[0];
const goalRows = fixture as unknown as Row[];

describe('Gol Krallığı — O topscorers yanıtına gömülü', () => {
  it('filtre: tür + oyuncu istatistiği sezonu + yalnız APPEARANCES (321)', () => {
    expect(topscorerAppearanceFilters(208, 28203)).toBe('seasonTopscorerTypes:208;playerStatisticSeasons:28203;playerStatisticDetailTypes:321');
  });

  it('oyuncu başına o sezon, o takımdaki oynanan maç', () => {
    expect(goalRows.map((r) => appearancesFromRow(r, 28203))).toEqual([6, 6, 4]);
    expect(appearancesFromRow(goalRows[0]!, 99999)).toBeUndefined(); // başka sezon
    const otherTeam = { ...goalRows[0]!, participant_id: 1 };
    expect(appearancesFromRow(otherTeam, 28203)).toBeUndefined(); // transfer: başka takım satırı sayılmaz
  });

  it('liste gol sırası; O doluysa asist sıralamasında olmayanın asisti 0, asist satırı varsa asist', () => {
    const assist = { ...goalRows[1]!, id: 1, type_id: 209, total: 3 } as Row;
    const out = mapTopScorersWithAppearances([...goalRows, assist], 28203)!;
    expect(out.map((e) => [e.player?.name?.trim(), e.goals, e.played, e.assists])).toEqual([
      ['Gift Orban', 7, 6, 0],
      ['Mohamed Salah', 7, 6, 3],
      ['Victor Osimhen', 6, 4, 0],
    ]);
  });

  it('O bilinmiyorsa (istatistik yok) played ve assists boş kalır ("—")', () => {
    const bare = { ...goalRows[0]!, player: { ...goalRows[0]!.player!, statistics: [] } } as Row;
    const [e] = mapTopScorersWithAppearances([bare], 28203)!;
    expect(e!.played).toBeUndefined();
    expect(e!.assists).toBeUndefined();
  });
});
