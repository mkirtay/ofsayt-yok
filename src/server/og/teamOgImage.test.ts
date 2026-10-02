import { describe, expect, it, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { renderTeamOgImage, teamOgDisplayName } from './teamOgImage';

afterEach(() => vi.restoreAllMocks());

describe('renderTeamOgImage', () => {
  it('logolar gelmezse (ağ hatası) baş harflerle 1200×630 PNG', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const img = await renderTeamOgImage({
      team: { id: 34, name: 'Galatasaray', logo: 'https://cdn.sportmonks.com/images/soccer/teams/2/34.png' },
      competition: { id: 600, name: 'Süper Lig', logo: 'https://cdn.sportmonks.com/images/soccer/leagues/24/600.png' },
      standing: { rank: 2, points: 18 },
      form: ['W', 'D', 'L', 'W', 'W'],
    });
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
  });

  it('uzun ad → sözlükteki kısa ad, yoksa kesme', () => {
    expect(teamOgDisplayName({ id: 3702, name: 'İstanbul Başakşehir' })).toBe('İstanbul Başakşehir');
    expect(teamOgDisplayName({ id: 890, name: 'Jagiellonia Białystok Extra Long' })).toBe('Jagiellonia');
    expect(teamOgDisplayName({ id: 1, name: 'Borussia Mönchengladbach II' })).toBe('Borussia Mönchengla…');
  });
});
