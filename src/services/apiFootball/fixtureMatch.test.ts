import { describe, expect, it } from 'vitest';
import { matchFixture, normalizeTeamName, teamNamesMatch, type AfFixtureSlim } from './fixtureMatch';

describe('teamNamesMatch', () => {
  it.each([
    ['Gençlerbirliği', 'Gençlerbirliği S.K.'],
    ['Beşiktaş', 'Besiktas'],
    ['Fenerbahçe', 'Fenerbahce SK'],
    ['Atlético Madrid', 'Atletico Madrid'],
    ['Inter', 'Inter Milan'],
    ['Paris Saint Germain', 'Paris Saint Germain'],
    ['Manchester United', 'Manchester United FC'],
    ['Bayern München', 'Bayern Munich'],
    ['Borussia Dortmund', 'Borussia Dortmund'],
    ['Brest', 'Stade Brestois 29'],
    ['Olympique Lyonnais', 'Lyon'],
    ['FC København', 'FC Copenhagen'],
    ['Brøndby IF', 'Brondby'],
    ['Zulte-Waregem', 'Zulte Waregem'],
  ])('%s ≈ %s', (a, b) => {
    expect(teamNamesMatch(a, b)).toBe(true);
  });

  it.each([
    ['Real Madrid', 'Real Sociedad'],
    ['Manchester City', 'Manchester United'],
    ['Galatasaray', 'Gaziantep'],
    ['Inter', 'Atalanta'],
  ])('%s ≠ %s', (a, b) => {
    expect(teamNamesMatch(a, b)).toBe(false);
  });

  it('normalize: aksan, noktalama, kulüp ekleri', () => {
    expect(normalizeTeamName('Gençlerbirliği S.K.')).toBe('genclerbirligi');
    expect(normalizeTeamName('FC Barcelona')).toBe('barcelona');
  });
});

const ts = (iso: string) => Date.parse(iso) / 1000;
const fixtures: AfFixtureSlim[] = [
  { id: 1584458, ts: ts('2026-11-08T18:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği S.K.', leagueId: 203 },
  { id: 1584459, ts: ts('2026-11-08T18:00:00Z'), home: 'Galatasaray', away: 'Gaziantep FK', leagueId: 203 },
  { id: 999, ts: ts('2026-11-08T21:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği S.K.', leagueId: 1 },
];

describe('matchFixture', () => {
  it('saat + iki takım adı ile eşler', () => {
    const f = matchFixture({ kickoffMs: Date.parse('2026-11-08T18:00:00Z'), home: 'Besiktas', away: 'Genclerbirligi' }, fixtures);
    expect(f?.fixture.id).toBe(1584458);
    expect(f?.quality).toBe('both-teams');
  });
  it('saat toleransı dışındaysa eşleşmez (aynı iki takımın başka saatteki maçı karışmaz)', () => {
    const f = matchFixture({ kickoffMs: Date.parse('2026-11-08T19:30:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği' }, fixtures);
    expect(f).toBeNull();
  });
  it('ev/deplasman yer değiştirmişse eşleşmez', () => {
    expect(matchFixture({ kickoffMs: Date.parse('2026-11-08T18:00:00Z'), home: 'Gençlerbirliği', away: 'Beşiktaş' }, fixtures)).toBeNull();
  });
  it('tek takım adı eşleşir + saat ±10 dk + tek aday → eşleşir (kalite işaretli)', () => {
    const fx: AfFixtureSlim[] = [
      { id: 1, ts: ts('2026-11-08T15:15:00Z'), home: 'Stade Brestois 29', away: 'Lyon', leagueId: 61 },
      { id: 2, ts: ts('2026-11-08T15:15:00Z'), home: 'Heart Of Midlothian', away: 'Falkirk', leagueId: 179 },
    ];
    const r = matchFixture({ kickoffMs: Date.parse('2026-11-08T15:15:00Z'), home: 'Hearts', away: 'Falkirk' }, fx);
    expect(r).toMatchObject({ quality: 'time-and-one-team', fixture: { id: 2 } });
    // Saat 20 dk kayıksa tek takım adı yetmez.
    expect(matchFixture({ kickoffMs: Date.parse('2026-11-08T15:35:00Z'), home: 'Hearts', away: 'Falkirk' }, fx)).toBeNull();
    // Aynı saatte aynı takımı içeren iki aday → belirsiz → null.
    const dup = [...fx, { id: 3, ts: ts('2026-11-08T15:15:00Z'), home: 'Hearts B', away: 'Falkirk', leagueId: 9 }];
    expect(matchFixture({ kickoffMs: Date.parse('2026-11-08T15:15:00Z'), home: 'Hearts Reserves', away: 'Falkirk' }, dup)).toBeNull();
  });

  it('bilinmeyen takım → null', () => {
    expect(matchFixture({ kickoffMs: Date.parse('2026-11-08T18:00:00Z'), home: 'Rizespor', away: 'Kasımpaşa' }, fixtures)).toBeNull();
  });
});
