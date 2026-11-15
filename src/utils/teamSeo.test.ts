import { describe, expect, it } from 'vitest';
import { buildTeamSummary, teamJsonLd } from './teamSeo';

const facts = {
  logo: 'https://cdn/x.png',
  coach: 'Okan Buruk',
  venue: { name: 'RAMS Park', city: 'İstanbul', capacity: 52223 },
  season: { name: '2026/2027', competitions: ['Süper Lig', 'UEFA Şampiyonlar Ligi'] },
  xUrl: 'https://x.com/GalatasaraySK',
};

describe('teamSeo', () => {
  it('durağan bilgilerden özet cümleleri', () => {
    const s = buildTeamSummary('Galatasaray', facts).join(' ');
    expect(s).toContain('2026/2027 sezonunda Süper Lig, UEFA Şampiyonlar Ligi turnuvalarında');
    expect(s).toContain('Teknik direktör: Okan Buruk.');
    expect(s).toContain('Stadyum: RAMS Park (İstanbul, 52.223 kişilik).');
  });

  it('bilgi yoksa özet yok', () => {
    expect(buildTeamSummary('X', null)).toEqual([]);
    expect(buildTeamSummary('X', { logo: null, coach: null, venue: null, season: null, xUrl: null })).toEqual([]);
  });

  it('SportsTeam yapısal verisi', () => {
    const j = teamJsonLd('Galatasaray', 'https://s/teams/1', facts, null);
    expect(j['@type']).toBe('SportsTeam');
    expect(j.coach).toEqual({ '@type': 'Person', name: 'Okan Buruk' });
    expect(j.sameAs).toEqual(['https://x.com/GalatasaraySK']);
    expect(j).not.toHaveProperty('image');
  });
});
