import { describe, it, expect } from 'vitest';
import { pivotStandingRow } from './standingsPivot';
import type { SportmonksStandingRow } from './types';
import standingsLaLiga from './__fixtures__/standingsLaLiga.json';

describe('pivotStandingRow — Faz 3, gerçek La Liga standings/seasons/27965 örneği', () => {
  it('FC Barcelona satırını (22 gerçek details[] kaydı) doğru pivotlar', () => {
    const [barcelona] = standingsLaLiga as SportmonksStandingRow[];
    const pivoted = pivotStandingRow(barcelona);

    expect(pivoted).toMatchObject({
      rank: 1,
      points: 18,
      matches: 6,
      won: 6,
      drawn: 0,
      lost: 0,
      goals_scored: 28,
      goals_conceded: 6,
      goal_diff: 22, // Sportmonks'un kendi verdiği OVERALL_GOAL_DIFFERENCE (28-6 ile de örtüşüyor)
      team_id: 83,
      name: 'FC Barcelona',
    });
    expect(pivoted.logo).toContain('83.png');
  });

  it('yazım hatalı "Overal Goals Scored" type.name\'i developer_name (OVERALL_SCORED) üzerinden doğru pivotlar', () => {
    const [barcelona] = standingsLaLiga as SportmonksStandingRow[];
    const scoredDetail = barcelona.details?.find((d) => d.type?.name === 'Overal Goals Scored');
    expect(scoredDetail).toBeDefined(); // yazım hatası gerçek response'ta birebir doğrulandı
    expect(scoredDetail?.type?.developer_name).toBe('OVERALL_SCORED');

    const pivoted = pivotStandingRow(barcelona);
    expect(pivoted.goals_scored).toBe(28);
  });

  it('Home/Away alt-detay satırlarını (developer_name HOME_*/AWAY_*) Overall alanlarına karıştırmaz', () => {
    const [barcelona] = standingsLaLiga as SportmonksStandingRow[];
    const pivoted = pivotStandingRow(barcelona);
    // Home (3) + Away (3) = 6 Overall — home/away satırları ayrı ayrı toplanıp
    // "matches"e eklenseydi 12 çıkardı, pivot sadece OVERALL_* alanını kullanıyor.
    expect(pivoted.matches).toBe(6);
  });

  it('details[] hiç yoksa (Real Madrid örneği) sayısal alanlar 0\'a, goal_diff türetilmiş 0\'a düşer', () => {
    const [, realMadrid] = standingsLaLiga as SportmonksStandingRow[];
    const pivoted = pivotStandingRow(realMadrid);

    expect(pivoted).toMatchObject({
      rank: 2,
      points: 15,
      matches: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_scored: 0,
      goals_conceded: 0,
      goal_diff: 0,
      team_id: realMadrid.participant_id,
      name: 'Real Madrid',
    });
  });

  it('developer_name eksik ama type.name doluysa (birebir eşleşme) yedek yoldan pivotlar', () => {
    const row: SportmonksStandingRow = {
      id: 1,
      participant_id: 99,
      league_id: 1,
      season_id: 1,
      position: 5,
      points: 10,
      participant: { id: 99, name: 'Test FC' },
      details: [
        { id: 1, type_id: 133, value: 12, type: { id: 133, name: 'Overal Goals Scored' } },
        { id: 2, type_id: 134, value: 4, type: { id: 134, name: 'Overall Goals Conceded' } },
      ],
    };
    const pivoted = pivotStandingRow(row);
    expect(pivoted.goals_scored).toBe(12);
    expect(pivoted.goals_conceded).toBe(4);
    expect(pivoted.goal_diff).toBe(8); // OVERALL_GOAL_DIFFERENCE satırı yok — türetildi
  });
});
