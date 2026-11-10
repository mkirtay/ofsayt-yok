import { describe, expect, it } from 'vitest';
import type { CompetitionTableData } from '@/services/liveScoreService';
import { reduceStandingsToTeamGroup, standingsGroupCount, titleStandings } from './nationalStandings';

const row = (id: number) => ({ rank: 1, points: 0, matches: 0, team_id: id, name: `T${id}` }) as never;
const data: CompetitionTableData = {
  competition: { id: 2000000005, name: 'UEFA Uluslar Ligi' },
  stages: [
    {
      groups: [
        { id: 1, name: 'League A - Group A', standings: [row(1), row(2)] },
        { id: 2, name: 'League A - Group B', standings: [row(3), row(4)] },
      ],
    },
  ],
};

describe('nationalStandings', () => {
  it('maçın grubuna indirger', () => {
    const r = reduceStandingsToTeamGroup(data, [3, 99]);
    expect(r.groupName).toBe('League A - Group B');
    expect(r.groupCount).toBe(2);
    expect(r.data.table?.map((x) => x.team_id)).toEqual([3, 4]);
    expect(r.data.stages).toBeUndefined();
  });
  it('eşleşme yoksa tam veri', () => {
    expect(reduceStandingsToTeamGroup(data, [99]).data).toBe(data);
  });
  it('grup sayısı; tek tablo 0', () => {
    expect(standingsGroupCount(data)).toBe(2);
    expect(standingsGroupCount({ table: [row(1)] } as CompetitionTableData)).toBe(0);
  });
  it('başlık turnuva · grup', () => {
    expect(titleStandings(data, 'B Grubu').title).toBe('UEFA Uluslar Ligi · B Grubu');
    expect(titleStandings(data, null).data).toBe(data);
  });
});
