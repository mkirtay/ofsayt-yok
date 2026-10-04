import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { packHomeMatches, trimListMatch, unpackHomeMatches } from './homeInitialData';

function match(id: number, extra: Partial<Match> = {}): Match {
  return {
    id,
    status: 'NOT STARTED',
    time: '',
    date: '2026-10-04',
    scheduled: '16:00',
    location: 'Stadyum',
    referee: 'Hakem',
    season_id: 26000,
    stage: 'Regular Season',
    round: '8',
    home: { id: id * 10, name: `Ev ${id}`, logo: 'https://cdn.sportmonks.com/images/soccer/teams/1/1.png' },
    away: { id: id * 10 + 1, name: `Dep ${id}`, logo: undefined as unknown as string },
    scores: { score: '', ht_score: '', ft_score: '' },
    competition: { id: 600, name: 'Süper Lig', logo: 'https://cdn.sportmonks.com/images/soccer/leagues/600.png' },
    country: { id: 404, name: 'Türkiye', flag: 'https://cdn.sportmonks.com/x.png', fifa_code: 'TUR' } as Match['country'],
    ...extra,
  } as Match;
}

describe('trimListMatch', () => {
  it('liste dışı alanları ve undefined değerleri atar, listeninkileri korur', () => {
    const t = trimListMatch(match(1)) as unknown as Record<string, unknown>;
    for (const k of ['location', 'referee', 'season_id', 'stage', 'round']) expect(t).not.toHaveProperty(k);
    // Maç detayı ekleri liste props'una girmez
    const extra = trimListMatch({ ...match(2), referee_id: 9, tv_stations: ['TOD'], coaches: { home: 'A' }, weather: { tempC: 20 }, hashtag: '#AB' } as Match) as unknown as Record<string, unknown>;
    for (const k of ['referee_id', 'tv_stations', 'coaches', 'weather', 'hashtag']) expect(extra).not.toHaveProperty(k);
    expect(t.country).toEqual({ id: 404, name: 'Türkiye', flag: 'https://cdn.sportmonks.com/x.png' });
    expect((t.away as Record<string, unknown>)).not.toHaveProperty('logo');
    expect(t).toMatchObject({ id: 1, status: 'NOT STARTED', date: '2026-10-04', scheduled: '16:00', home: { id: 10, name: 'Ev 1' } });
    // Next props'u JSON'dur: tur sonrası aynı kalmalı.
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });
});

describe('packHomeMatches / unpackHomeMatches', () => {
  it('fikstürde olan canlı maç indeksle taşınır; geri açınca API sırası ve içerik aynı', () => {
    const f1 = match(1);
    const f2 = match(2, { status: 'IN PLAY', time: "34'" });
    const otherDayLive = match(3, { status: 'IN PLAY', date: '2026-10-03' });
    const packed = packHomeMatches({ fixtureMatches: [f1, f2], liveMatches: [otherDayLive, f2] });
    expect(packed.live[1]).toBe(1);
    expect(typeof packed.live[0]).toBe('object');

    const out = unpackHomeMatches(JSON.parse(JSON.stringify(packed)));
    expect(out.fixtureMatches.map((m) => m.id)).toEqual([1, 2]);
    expect(out.liveMatches.map((m) => m.id)).toEqual([3, 2]);
    // Sportmonks'ta günün listesi ile fikstür aynı dizi (eski hook davranışı).
    expect(out.allMatches).toBe(out.fixtureMatches);
    expect(out.liveMatches[1]).toBe(out.fixtureMatches[1]);
  });

  it('geri açılan maçlar kırpılmış API maçlarıyla birebir aynı; lig nesneleri tek kez taşınır', () => {
    const fixtures = [match(1), match(2), match(3, { competition: { id: 8, name: 'Premier League', logo: 'x' } })];
    const packed = packHomeMatches({ fixtureMatches: fixtures, liveMatches: [] });
    expect(packed.leagues).toHaveLength(2);
    expect(unpackHomeMatches(JSON.parse(JSON.stringify(packed))).fixtureMatches).toEqual(fixtures.map(trimListMatch));
  });

  it('canlı listedeki kopya fikstürden farklıysa (daha taze) nesne olarak taşınır', () => {
    const f2 = match(2, { status: 'IN PLAY', time: "34'" });
    const fresher = { ...f2, time: "35'" };
    const packed = packHomeMatches({ fixtureMatches: [f2], liveMatches: [fresher] });
    expect(typeof packed.live[0]).toBe('object');
    expect(unpackHomeMatches(packed).liveMatches[0]!.time).toBe("35'");
  });

  it('eski sağlayıcının history listesi korunur', () => {
    const packed = packHomeMatches({ fixtureMatches: [match(1)], liveMatches: [], historyMatches: [match(9)] });
    expect(unpackHomeMatches(packed).allMatches.map((m) => m.id)).toEqual([9]);
  });

  it('gece maçları ayrı alanda taşınır; yoksa alan hiç yazılmaz (ISR props aynı kalır)', () => {
    const night = match(5, { date: '2026-10-04', scheduled: '23:00', competition: { id: 648, name: 'Serie A', logo: 'b' } });
    const packed = packHomeMatches({ fixtureMatches: [match(1)], liveMatches: [], nightMatches: [night] });
    expect(packed.night).toHaveLength(1);
    expect(unpackHomeMatches(JSON.parse(JSON.stringify(packed))).nightMatches).toEqual([trimListMatch(night)]);

    const none = packHomeMatches({ fixtureMatches: [match(1)], liveMatches: [], nightMatches: [] });
    expect(none).not.toHaveProperty('night');
    expect(unpackHomeMatches(none).nightMatches).toEqual([]);
  });

  it('115 maçlık gün < 60 KB (kırpılmış)', () => {
    const fixtures = Array.from({ length: 115 }, (_, i) => match(19_600_000 + i, { scores: { score: '2-1', ht_score: '1-0', ft_score: '2-1' } }));
    const size = JSON.stringify(packHomeMatches({ fixtureMatches: fixtures, liveMatches: fixtures.slice(0, 20) })).length;
    expect(size).toBeLessThan(60_000);
  });
});
