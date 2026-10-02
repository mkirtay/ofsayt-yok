import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';

const h = vi.hoisted(() => ({ overview: vi.fn(), standings: vi.fn() }));
vi.mock('@/services/teamPage', () => ({ getTeamOverview: h.overview }));
vi.mock('@/services/competitionStandings', () => ({ getCompetitionStandings: h.standings }));

import { loadTeamOgData } from './teamOgData';

const sl = { id: 600, name: 'Super Lig', logo: 'https://cdn.sportmonks.com/images/soccer/leagues/24/600.png' };
const match = (id: number, score: string, home: number, away: number, comp = sl) => ({
  id,
  status: 'FINISHED',
  time: '',
  scores: { score },
  home: { id: home, name: 'H' },
  away: { id: away, name: 'A' },
  competition: comp,
});

beforeEach(() => {
  h.overview.mockReset();
  h.standings.mockReset();
});

describe('loadTeamOgData', () => {
  it('form eskiden yeniye (son 5), lig adı Türkçe, sıra puan durumundan (gruplu tablo dahil)', async () => {
    h.overview.mockResolvedValue({
      team: { id: 34, name: 'Galatasaray', logo: 'x' },
      // en yeni başta: G, B, M, G, G, (6. maç sayılmaz)
      recent: [match(6, '2-0', 34, 1), match(5, '1-1', 2, 34), match(4, '0-1', 34, 3), match(3, '0-2', 4, 34), match(2, '3-1', 34, 5), match(1, '0-5', 34, 6)],
      fixtures: [],
      campaigns: [],
    });
    h.standings.mockResolvedValue({ stages: [{ groups: [{ standings: [{ rank: 2, points: 18, team: { id: 34 } }] }] }] });

    const d = await loadTeamOgData('34');
    expect(d?.form).toEqual(['W', 'W', 'L', 'D', 'W']);
    expect(d?.competition).toEqual({ id: 600, name: 'Süper Lig', logo: sl.logo });
    expect(d?.standing).toEqual({ rank: 2, points: 18 });
    expect(h.standings).toHaveBeenCalledWith('600');
  });

  it('puan durumunda yoksa sıra null; Sportmonks "yok" → null; geçici hata fırlatır', async () => {
    h.overview.mockResolvedValueOnce({ team: { id: 9, name: 'X' }, recent: [match(1, '1-0', 9, 2)], fixtures: [], campaigns: [] });
    h.standings.mockResolvedValueOnce({ table: [{ rank: 1, points: 3, team: { id: 2 } }] });
    expect((await loadTeamOgData('9'))?.standing).toBeNull();

    h.overview.mockRejectedValueOnce(new SportmonksHttpError('yok', 404, {}));
    expect(await loadTeamOgData('999')).toBeNull();
    h.overview.mockResolvedValueOnce({ team: null, recent: [], fixtures: [], campaigns: [] });
    expect(await loadTeamOgData('998')).toBeNull();

    h.overview.mockRejectedValueOnce(new SportmonksHttpError('down', 503, {}));
    await expect(loadTeamOgData('34')).rejects.toThrow('down');
  });
});
