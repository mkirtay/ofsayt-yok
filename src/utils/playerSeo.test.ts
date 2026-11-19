import { describe, expect, it } from 'vitest';
import { buildPlayerSeo } from './playerSeo';

describe('buildPlayerSeo', () => {
  it('takım, mevki, yaş, uyruk + son lig sezonu', () => {
    const s = buildPlayerSeo(
      {
        id: 1, name: 'Victor Osimhen', dateOfBirth: '1998-12-29', position: 'Attacker', nationality: { name: 'Nigeria', iso2: 'NG' },
        currentTeam: { id: 34, name: 'Galatasaray' }, transfers: [],
        seasons: [
          { key: 'c', isCup: true, seasonId: 3, seasonName: '2026/2027', leagueName: 'Champions League', stats: { 321: { total: 4 }, 52: { total: 3 } } },
          { key: 'l', isCup: false, seasonId: 2, seasonName: '2026/2027', leagueName: 'Super Lig', leagueId: 600, stats: { 321: { total: 11 }, 52: { total: 9 }, 79: { total: 2 } } },
        ],
      },
      Date.parse('2026-11-16T00:00:00Z'),
    );
    expect(s.sentences).toEqual([
      'Victor Osimhen, Galatasaray takımında forvet olarak oynuyor (27 yaşında, Nijerya).',
      '2026/2027 Süper Lig sezonunda 11 maçta 9 gol ve 2 asist kaydetti.',
    ]);
  });
  it('güncel takımı yoksa (emekli / kulüpsüz) "oynuyor" denmez', () => {
    const s = buildPlayerSeo(
      { id: 1, name: 'Rob Hulse', dateOfBirth: '1979-10-25', position: 'Midfielder', nationality: { name: 'England' }, seasons: [], transfers: [] },
      Date.parse('2026-11-16T00:00:00Z'),
    );
    expect(s.sentences).toEqual(['Rob Hulse, orta saha oyuncusu (47 yaşında, İngiltere).']);
  });
  it('veri azsa yalnız olanlar', () => {
    expect(buildPlayerSeo({ id: 2, name: 'X', seasons: [], transfers: [] }).sentences).toEqual([]);
  });
});
