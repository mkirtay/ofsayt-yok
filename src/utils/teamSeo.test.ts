import { describe, expect, it } from 'vitest';
import { buildTeamSummary, primaryLeague, teamJsonLd, teamPageDescription, teamPageTitle } from './teamSeo';

const brand = (t: string) => `${t} | Scor3`;

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

  it('ana lig: güncel sezonda domestic olan turnuva, Türkçe kısa ad; yoksa null', () => {
    const campaigns = [
      {
        name: '2026/2027',
        seasons: [
          { id: 1, name: '2026/2027', leagueId: 2, leagueName: 'Champions League', leagueSubType: 'cup_international', isCurrent: true, finished: false },
          { id: 2, name: '2026/2027', leagueId: 600, leagueName: 'Super Lig', leagueSubType: 'domestic', isCurrent: true, finished: false },
        ],
      },
    ];
    expect(primaryLeague(campaigns)).toEqual({ id: 600, name: 'Süper Lig' });
    expect(primaryLeague([{ name: 'x', seasons: [campaigns[0]!.seasons[0]!] }])).toBeNull();
    expect(primaryLeague(undefined)).toBeNull();
  });

  it('başlık: 60 karaktere sığan ilk kademe (ligli → ligsiz → kısa + marka)', () => {
    const sl = { id: 600, name: 'Süper Lig' };
    expect(teamPageTitle('Göztepe', sl, brand)).toBe('Göztepe (Süper Lig) Maçları, İstatistikleri ve Puan Durumu');
    expect(teamPageTitle('Galatasaray', sl, brand)).toBe('Galatasaray Maçları, İstatistikleri ve Puan Durumu');
    expect(teamPageTitle('Borussia Mönchengladbach', { id: 82, name: 'Bundesliga' }, brand)).toBe('Borussia Mönchengladbach Maçları ve Puan Durumu | Scor3');
    for (const n of ['Galatasaray', 'Wolverhampton Wanderers', 'İstanbul Başakşehir FK']) expect(teamPageTitle(n, sl, brand).length).toBeLessThanOrEqual(60);
  });

  it('açıklama: lig + teknik direktör, ≤155', () => {
    const d = teamPageDescription('Galatasaray', { id: 600, name: 'Süper Lig' }, 'Okan Buruk');
    expect(d).toBe('Galatasaray (Süper Lig) maçları, sonuçları ve fikstürü; oyuncu istatistikleri, kadro ve güncel Süper Lig puan durumu. Teknik direktör: Okan Buruk.');
    expect(d.length).toBeLessThanOrEqual(155);
    expect(teamPageDescription('X', null, null)).toBe('X maçları, sonuçları ve fikstürü; oyuncu istatistikleri, kadro ve puan durumu.');
  });

  it('özet: lig cümlesi + tarihli puan durumu satırı', () => {
    const s = buildTeamSummary('Galatasaray', {
      ...facts,
      league: { id: 600, name: 'Süper Lig', slug: 'super-lig' },
      standing: { rank: 1, points: 31, played: 12, won: 10, drawn: 1, lost: 1, goalDiff: 22, asOf: '22 Kasım' },
    });
    expect(s[0]).toBe('Galatasaray, Süper Lig takımı.');
    expect(s[1]).toBe('22 Kasım itibarıyla Süper Lig puan durumunda 1. sırada: 12 maçta 31 puan (10 galibiyet, 1 beraberlik, 1 mağlubiyet; averaj +22).');
  });

  it('memberOf: ligler SportsOrganization, lig sayfası olanlar /lig/{slug} bağlantılı', () => {
    const j = teamJsonLd('Galatasaray', 'https://s/teams/1', { ...facts, season: { name: '2026/2027', competitions: ['Süper Lig', 'Türkiye Kupası'], leagueIds: [600, 606] } }, null) as {
      memberOf: { '@type': string; name: string; url?: string }[];
    };
    expect(j.memberOf[0]).toEqual({ '@type': 'SportsOrganization', name: 'Süper Lig', url: expect.stringMatching(/\/lig\/super-lig$/) });
    expect(j.memberOf[1]).toEqual({ '@type': 'SportsOrganization', name: 'Türkiye Kupası' });
  });
});
