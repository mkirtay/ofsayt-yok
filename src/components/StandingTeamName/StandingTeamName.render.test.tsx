import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MiniStandingsWidget from '@/components/HubWidgets/MiniStandingsWidget';
import type { CompetitionTableData } from '@/services/liveScoreService';

const row = (rank: number, id: number, name: string, short_code?: string) => ({
  rank, points: 20 - rank, matches: 6, won: 4, drawn: 1, lost: 1, goal_diff: 5, goals_scored: 10, goals_conceded: 5,
  team: { id, name, ...(short_code ? { short_code } : {}) }, team_id: id, name,
});
const data: CompetitionTableData = {
  competition: { id: 600, name: 'Süper Lig' },
  table: [row(1, 34, 'Galatasaray', 'GAL'), row(2, 999, 'Esenler Erokspor')],
};

describe('puan durumu — tam isim + kısaltma birlikte basılır, CSS kapsayıcıya göre seçer', () => {
  const html = renderToStaticMarkup(<MatchCompetitionStandings data={data} />);

  it('kısaltması olan takım: iki span, bağlantıda tam isim title + aria-label', () => {
    expect(html).toMatch(/<a [^>]*title="Galatasaray"[^>]*aria-label="Galatasaray"[^>]*>.*Galatasaray.*GAL.*<\/a>/);
    expect(html).toMatch(/aria-hidden="true" data-testid="team-short-code">GAL</);
  });

  it('kısaltması olmayan takım: yalnızca tam isim (ellipsis mevcut CSS\'te)', () => {
    expect(html).toMatch(/aria-label="Esenler Erokspor"[^>]*>Esenler Erokspor<\/a>/);
    expect((html.match(/team-short-code/g) ?? []).length).toBe(1);
  });

  it('mini widget de aynı bileşeni kullanır', () => {
    const mini = renderToStaticMarkup(<MiniStandingsWidget data={data} loading={false} competitionName="Süper Lig" />);
    expect(mini).toContain('data-testid="team-short-code">GAL<');
    expect(mini).toContain('title="Galatasaray"');
  });
});
