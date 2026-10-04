import { describe, expect, it } from 'vitest';
import { REFEREE_FEW_MATCHES, refereeSummaryPromptLines, summarizeRefereeStats, type RawReferee } from './refereeStats';
import { findGamblingTerms } from '@/utils/gamblingTerms';

// Gerçek yanıt şekli (B. Kolak 62331, 2026-10-04): bu sezon 3 maç, geçen sezon (Süper Lig 25682) daha fazla.
const det = (name: string, value: unknown) => ({ value, type: { developer_name: name } });
const raw: RawReferee = {
  id: 62331,
  common_name: 'B. Kolak',
  statistics: [
    {
      season_id: 28203,
      season: { id: 28203, name: '2026/2027', league_id: 600, starting_at: '2026-08-14', is_current: true },
      details: [
        det('MATCHES', { count: 3 }),
        det('YELLOWCARDS', { all: { count: 12, average: 4 }, home: { count: 5 } }),
        det('REDCARDS', { all: { count: 0, average: 0 } }),
        det('PENALTIES', { all: { count: 1, average: 0.33 } }),
        det('FOULS', { count: 74, average: 24.67 }),
      ],
    },
    {
      season_id: 25682,
      season: { id: 25682, name: '2025/2026', league_id: 600, starting_at: '2025-08-08' },
      details: [det('MATCHES', { count: 20 }), det('YELLOWCARDS', { all: { count: 90 } }), det('VAR_MOMENTS', { count: 7, average: 0.35 })],
    },
    {
      season_id: 25749,
      season: { id: 25749, name: '2025/2026', league_id: 603, starting_at: '2025-08-09' },
      details: [det('MATCHES', { count: 4 })],
    },
    {
      season_id: 23851,
      season: { id: 23851, name: '2024/2025', league_id: 600, starting_at: '2024-08-02' },
      details: [det('MATCHES', { count: 25 })],
    },
  ],
};

describe('hakem özeti', () => {
  it('bu sezon: maç sayısı + maç başı değerler sayıdan hesaplanır; olmayan tür null', () => {
    const s = summarizeRefereeStats(raw, 28203, 600)!;
    expect(s.name).toBe('B. Kolak');
    expect(s.current).toMatchObject({ seasonName: '2026/2027', matches: 3, yellowPerMatch: 4, redPerMatch: 0, penaltiesPerMatch: 0.33, foulsPerMatch: 24.67, varPerMatch: null });
  });

  it(`bu sezon ${REFEREE_FEW_MATCHES} maçtan azsa aynı ligin bir önceki sezonu (başka lig ve daha eski sezon değil)`, () => {
    const s = summarizeRefereeStats(raw, 28203, 600)!;
    expect(s.previous).toMatchObject({ seasonId: 25682, seasonName: '2025/2026', matches: 20, yellowPerMatch: 4.5, varPerMatch: 0.35 });
  });

  it('bu sezon yeterli maç varsa geçen sezon yok; bu sezon kaydı yoksa maç sayısı 0 ile döner', () => {
    const many: RawReferee = { ...raw, statistics: [{ ...raw.statistics![0]!, details: [det('MATCHES', { count: 9 })] }, raw.statistics![1]!] };
    expect(summarizeRefereeStats(many, 28203, 600)!.previous).toBeNull();
    const none = summarizeRefereeStats({ id: 1, common_name: 'X', statistics: [] }, 28203, 600)!;
    expect(none.current.matches).toBe(0);
    expect(none.previous).toBeNull();
    expect(summarizeRefereeStats(null, 28203, 600)).toBeNull();
  });

  it('AI bağlamı satırları yalnız sayı; kumar dili yok', () => {
    const lines = refereeSummaryPromptLines(summarizeRefereeStats(raw, 28203, 600)!);
    expect(lines[0]).toBe('Hakem istatistikleri — B. Kolak');
    expect(lines[1]).toContain('Bu sezon (2026/2027): 3 maç');
    expect(lines[1]).toContain('maç başı sarı 4');
    expect(lines[2]).toContain('Geçen sezon (2025/2026): 20 maç');
    expect(findGamblingTerms(lines.join('\n'))).toEqual([]);
  });
});

describe('hakem sayfası sezon tablosu', () => {
  it('lig × sezon, maçı olan satırlar, yeni sezon önce; bu sezonun id\'leri', async () => {
    const { refereeSeasonTable, currentSeasonIds } = await import('./refereeStats');
    const rows = refereeSeasonTable(raw);
    expect(rows.map((r) => [r.seasonName, r.leagueId, r.matches])).toEqual([
      ['2026/2027', 600, 3],
      ['2025/2026', 603, 4],
      ['2025/2026', 600, 20],
      ['2024/2025', 600, 25],
    ]);
    expect(currentSeasonIds(raw)).toEqual([28203]);
  });
});
