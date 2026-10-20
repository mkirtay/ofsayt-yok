import { describe, expect, it } from 'vitest';
import {
  buildStatUnits,
  istanbulToday,
  parseStatUnitKey,
  pickDefaultStatUnit,
  statUnitKey,
  summarizeRoundStatistics,
  type RawRoundStatistic,
  type RawSeasonStage,
} from './roundStats';
// Gerçek yanıtlar (2026-10-21), participant nesneleri küçültülmüş: Süper Lig 26/27 8. hafta, ŞL 26/27 play-off aşaması.
import roundSl8 from './__fixtures__/roundStatisticsSuperLig8.json';
import stageUclPo from './__fixtures__/stageStatisticsUclPlayoffs.json';
import stagesSl from './__fixtures__/stagesSeasonSuperLig.json';
import stagesUcl from './__fixtures__/stagesSeasonUcl.json';

describe('summarizeRoundStatistics', () => {
  it('Süper Lig 8. hafta (RoundStatistic)', () => {
    const s = summarizeRoundStatistics(roundSl8.data as RawRoundStatistic[])!;
    expect(s.played).toBe(9);
    expect(s.scheduled).toBe(9);
    expect(s.goals).toEqual({ total: 23, perMatch: 2.56, home: 17, away: 6 });
    expect(s.bothScored).toEqual({ count: 4, pct: 44.44 });
    expect(s.threePlusGoals).toEqual({ count: 5, pct: 55.56 });
    expect(s.cards).toEqual({ yellow: 33, red: 0, perMatch: 3.7 });
    // DRAW_PERCENTAGE yok (o hafta beraberlik yok) → 100 − ev − deplasman
    expect(s.results).toEqual({ homePct: 77.8, awayPct: 22.2, drawPct: 0 });
    expect(s.scoringMinutes?.map((b) => b.bin)).toEqual(['0-15', '15-30', '30-45', '45-60', '60-75', '75-90']);
    expect(s.scoringMinutes?.reduce((a, b) => a + b.count, 0)).toBe(23);
    expect(s.topPlayer).toEqual({
      id: 37667492,
      name: 'Adem Arous',
      rating: 9.32,
      image: 'https://cdn.sportmonks.com/images/soccer/players/4/37667492.png',
    });
    expect(s.topTeam).toMatchObject({ id: 1071, name: 'Kasımpaşa', rating: 7.24 });
    expect(s.mostGoalsTeam).toMatchObject({ id: 1071, goals: 4 });
    expect(s.topScorer).toMatchObject({ id: 37667492, goals: 2 });
    // Tek asistlik eşitlik: Sportmonks alfabetik ilk oyuncuyu veriyor → gösterilmez
    expect(s.topAssist).toBeNull();
  });

  it('ŞL play-off aşaması (StageStatistic)', () => {
    const s = summarizeRoundStatistics(stageUclPo.data as RawRoundStatistic[])!;
    expect(s.played).toBe(14);
    expect(s.scheduled).toBe(14);
    expect(s.goals.total).toBe(48);
    expect(s.cards).toEqual({ yellow: 46, red: 4, perMatch: 3.6 });
    expect(s.results).toEqual({ homePct: 50, awayPct: 21.4, drawPct: 28.6 });
    expect(s.topPlayer).toMatchObject({ id: 56289, rating: 8.02 });
    expect(s.topTeam).toMatchObject({ id: 1668, rating: 7.13 });
  });

  it('MATCHES satırı yoksa (ŞL lig aşaması yanıtı) oynanan maç gol ortalamasından türetilir', () => {
    const rows: RawRoundStatistic[] = [{ type_id: 191, value: { total: 187, average: 4.16 } }];
    expect(summarizeRoundStatistics(rows)).toMatchObject({ played: 45, scheduled: null });
  });

  it('MATCHES yokken gol ortalaması da yoksa yüzdeli sayaçtan türetir', () => {
    const rows: RawRoundStatistic[] = [
      { type_id: 191, value: { total: 0, average: 0 } },
      { type_id: 192, value: { count: 2, percentage: 25 } },
    ];
    expect(summarizeRoundStatistics(rows)?.played).toBe(8);
  });

  it('oynanmamış hafta / boş yanıt → null (veri yok)', () => {
    expect(summarizeRoundStatistics([])).toBeNull();
    expect(summarizeRoundStatistics(null)).toBeNull();
    // Gerçek 9. hafta yanıtı (henüz başlamadı): yalnız MATCHES played 0 + TOTAL_TEAMS
    expect(
      summarizeRoundStatistics([
        { type_id: 189, value: { total: 18, countries: 1 } },
        { type_id: 188, value: { total: 9, played: 0, percentage: 0 } },
      ]),
    ).toBeNull();
  });

  it('placeholder görsel ve adı olmayan oyuncu düşer', () => {
    const s = summarizeRoundStatistics([
      { type_id: 188, value: { total: 1, played: 1 } },
      { type_id: 211, relation_id: 5, value: { rating: 8, player_id: 5, player_name: 'X' }, participant: { id: 5, image_path: 'https://cdn.sportmonks.com/images/soccer/placeholder.png' } },
      { type_id: 212, relation_id: 6, value: { rating: 7, team_id: 6, team_name: '' } },
    ])!;
    expect(s.topPlayer).toEqual({ id: 5, name: 'X', rating: 8, image: null });
    expect(s.topTeam).toBeNull();
  });
});

describe('buildStatUnits', () => {
  it('Süper Lig: 34 haftadan bugüne kadar başlamış olanlar, son tamamlanan varsayılan', () => {
    const units = buildStatUnits(stagesSl.data as RawSeasonStage[], 'rounds', '2026-10-21');
    expect(units.map((u) => u.name)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(units.every((u) => u.kind === 'round' && u.stageName === null && u.complete)).toBe(true);
    expect(pickDefaultStatUnit(units, 'rounds')).toMatchObject({ id: 410383, name: '8' });
  });

  it('süren hafta listede ama varsayılan değil', () => {
    const units = buildStatUnits(stagesSl.data as RawSeasonStage[], 'rounds', '2026-10-24');
    expect(units.at(-1)).toMatchObject({ name: '9', complete: false });
    expect(pickDefaultStatUnit(units, 'rounds')?.name).toBe('8');
  });

  it('Şampiyonlar Ligi (aşama modu): aşamalar sırayla, varsayılan süren lig aşaması', () => {
    const units = buildStatUnits(stagesUcl.data as RawSeasonStage[], 'stages', '2026-10-21');
    expect(units.map((u) => u.name)).toEqual(['1st Qualifying Round', '2nd Qualifying Round', '3rd Qualifying Round', 'Play-offs', 'League Stage']);
    expect(units.every((u) => u.kind === 'stage')).toBe(true);
    expect(pickDefaultStatUnit(units, 'stages')).toMatchObject({ id: 77484090, complete: false });
  });

  it('lig modunda haftasız aşama tek birim; birden çok haftalı aşamada aşama adı eklenir', () => {
    const stages: RawSeasonStage[] = [
      { id: 2, sort_order: 2, name: 'Championship Round', starting_at: '2026-03-01', ending_at: '2026-05-01', rounds: [{ id: 21, name: '1', starting_at: '2026-03-01', ending_at: '2026-03-02' }] },
      { id: 1, sort_order: 1, name: 'Regular Season', starting_at: '2025-08-01', ending_at: '2026-02-20', rounds: [{ id: 11, name: '2', starting_at: '2025-08-08', ending_at: '2025-08-09' }, { id: 10, name: '1', starting_at: '2025-08-01', ending_at: '2025-08-02' }] },
      { id: 3, sort_order: 3, name: 'Play-offs', starting_at: '2026-05-10', ending_at: '2026-05-20', rounds: [] },
      { id: 4, sort_order: 4, name: 'Final', starting_at: '2026-07-01', ending_at: '2026-07-01', rounds: [] },
    ];
    const units = buildStatUnits(stages, 'rounds', '2026-05-15');
    expect(units.map((u) => [u.kind, u.id, u.stageName, u.complete])).toEqual([
      ['round', 10, 'Regular Season', true],
      ['round', 11, 'Regular Season', true],
      ['round', 21, 'Championship Round', true],
      ['stage', 3, null, false],
    ]);
  });

  it('boş / bozuk girdi', () => {
    expect(buildStatUnits(null, 'rounds', '2026-10-21')).toEqual([]);
    expect(pickDefaultStatUnit([], 'rounds')).toBeNull();
  });
});

describe('birim anahtarı', () => {
  it('gidiş-dönüş, geçersiz değerler null', () => {
    expect(statUnitKey({ kind: 'round', id: 410383 })).toBe('r410383');
    expect(parseStatUnitKey('s77484090')).toEqual({ kind: 'stage', id: 77484090 });
    for (const bad of ['x1', 'r', 'r-1', 'r1;drop', 's1234567890123', 12, undefined]) expect(parseStatUnitKey(bad)).toBeNull();
  });
});

describe('istanbulToday', () => {
  it('UTC 21:30 → TSİ ertesi gün', () => {
    expect(istanbulToday(Date.UTC(2026, 9, 20, 21, 30))).toBe('2026-10-21');
    expect(istanbulToday(Date.UTC(2026, 9, 20, 20, 30))).toBe('2026-10-20');
  });
});
