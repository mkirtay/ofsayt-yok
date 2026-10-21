import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import type { LiveStandingsData } from '@/services/liveStandings';
import MatchCompetitionStandings from './index';

const row = (rank: number, id: number, points: number): CompetitionTableStandingRow => ({
  rank,
  points,
  matches: 8,
  goal_diff: 0,
  won: 5,
  drawn: 1,
  lost: 2,
  team: { id, name: `Takım ${id}`, short_code: `T${id}` },
});
const data: CompetitionTableData = {
  competition: { id: 600, name: 'Süper Lig' },
  season: { id: 28203 },
  table: [row(1, 34, 19), row(2, 88, 17), row(3, 2, 16)],
};
const live = (rows: [number, number, number][], season_id = 28203): LiveStandingsData => ({
  leagueId: 600,
  rows: rows.map(([participant_id, position, points]) => ({ participant_id, position, points, result: 'equal', season_id })),
});
const render = (l: LiveStandingsData | null) => renderToStaticMarkup(<MatchCompetitionStandings data={data} hideHeader live={l} />);
const teamOrder = (html: string) => [...html.matchAll(/href="\/teams\/(\d+)"/g)].map((m) => Number(m[1]));

describe('<MatchCompetitionStandings live /> canlı puan durumu katmanı', () => {
  it('canlı sıra + puan, canlı sıraya göre; ▲/▼ ve başlıkta "Canlı" rozeti; değişen puan vurgulu', () => {
    const html = render(live([[34, 2, 19], [88, 3, 17], [2, 1, 19]]));
    expect(teamOrder(html)).toEqual([2, 34, 88]);
    expect(html).toMatch(/liveBadge[^>]*>Canlı</);
    expect(html).toContain('Takım · Canlı puan durumu');
    expect(html).toContain('data-move="up"');
    expect(html.match(/data-move="down"/g)).toHaveLength(2);
    expect(html).toMatch(/livePoints[^"]*">19</);
  });

  it('katman yok / hata (null) / sezon farklı → normal tablo, rozet yok', () => {
    for (const l of [null, live([[34, 2, 19], [88, 3, 17], [2, 1, 19]], 25749)]) {
      const html = render(l);
      expect(teamOrder(html)).toEqual([34, 88, 2]);
      expect(html).not.toContain('liveBadge');
      expect(html).not.toContain('data-move');
      expect(html).toContain('>Takım</th>');
    }
  });
});
