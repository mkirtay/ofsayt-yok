import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn() }));

import { REFEREE_FIXTURE_QUERY, refereeTableFromFixtures, type RawRefereeTableFixture } from './refereeFixtureTable';

const ref = (id: number, name: string, extra: object = {}) => ({ referee_id: id, type_id: 6, referee: { id, display_name: name, image_path: 'https://cdn.sportmonks.com/images/soccer/placeholder.png', country: { name: 'England', iso2: 'GB', image_path: 'https://cdn.sportmonks.com/images/countries/png/short/gb.png' }, ...extra } });
const ev = (type_id: number, rescinded = false) => ({ type_id, rescinded });
const fouls = (a: number, b: number) => [{ type_id: 56, data: { value: a } }, { type_id: 56, data: { value: b } }];
const team = (id: number, name: string, location: 'home' | 'away', country_id = 462) => ({ id, name, country_id, meta: { location } });

const fixtures: RawRefereeTableFixture[] = [
  {
    id: 1,
    starting_at: '2026-11-03 20:00:00',
    participants: [team(10, 'VfB Stuttgart', 'home', 11), team(20, 'Galatasaray', 'away', 404)],
    referees: [ref(14808, 'Chris Kavanagh'), { referee_id: 99, type_id: 7 }],
    events: [ev(19), ev(19), ev(19), ev(21), ev(16), ev(10), ev(19, true)],
    statistics: fouls(12, 14),
  },
  {
    id: 2,
    starting_at: '2026-10-01 20:00:00',
    participants: [team(30, 'Liverpool', 'home'), team(40, 'Real Madrid', 'away')],
    referees: [ref(14808, 'Chris Kavanagh')],
    events: [ev(19), ev(20), ev(17)],
    statistics: [],
  },
  { id: 3, participants: [team(50, 'A', 'home'), team(60, 'B', 'away')], referees: [ref(1, 'Diğer Hakem', { image_path: 'https://cdn.sportmonks.com/images//soccer/referees/1/1.png' })], events: [], statistics: fouls(10, 10) },
  // Aynı maç iki sayfada gelirse bir kez sayılır.
  { id: 3, participants: [], referees: [ref(1, 'Diğer Hakem')], events: [ev(19)], statistics: [] },
];

describe('fikstürden hakem tablosu (UEFA / Avrupa ligleri)', () => {
  const { rows, trMatches } = refereeTableFromFixtures(fixtures, { id: 28155, name: '2026/2027' });
  const k = rows.find((r) => r.refereeId === 14808)!;

  it('sarı 19; kırmızı 20 + 21; penaltı 16 + 17; VAR 10; VAR iptali sayılmaz; yardımcı hakem sayılmaz', () => {
    expect(rows).toHaveLength(2);
    expect(k).toMatchObject({ matches: 2, yellowPerMatch: 2, redPerMatch: 1, penaltiesPerMatch: 1, varPerMatch: 0.5, seasonId: 28155, seasonName: '2026/2027', slug: 'chris-kavanagh-14808' });
  });

  it('faul ortalaması yalnız faul verisi olan maçlardan; ülke bayrağı; yer tutucu fotoğraf yok, gerçek fotoğraf tek eğik çizgi', () => {
    expect(k.foulsPerMatch).toBe(26);
    expect(k.country).toEqual({ name: 'England', iso2: 'GB', flag: 'https://cdn.sportmonks.com/images/countries/png/short/gb.png' });
    expect(k.photo).toBeUndefined();
    expect(rows.find((r) => r.refereeId === 1)!.photo).toBe('https://cdn.sportmonks.com/images/soccer/referees/1/1.png');
    expect(rows.find((r) => r.refereeId === 1)!.matches).toBe(1);
  });

  it('Türk takımlarının maçları: ev/deplasman sırası ve orta hakem', () => {
    expect(trMatches).toEqual([
      { fixtureId: 1, startingAt: '2026-11-03 20:00:00', home: { id: 10, name: 'VfB Stuttgart' }, away: { id: 20, name: 'Galatasaray' }, referee: { id: 14808, name: 'Chris Kavanagh', slug: 'chris-kavanagh-14808' } },
    ]);
  });

  it('ligde hiç VAR olayı yoksa VAR sütunu boş', () => {
    const noVar = fixtures.map((f) => ({ ...f, events: (f.events ?? []).filter((e) => e.type_id !== 10) }));
    expect(refereeTableFromFixtures(noVar, { id: 1, name: 'x' }).rows.every((r) => r.varPerMatch === null)).toBe(true);
  });

  it('istek: yalnız bitmiş maç, olay ve faul süzgeçli (kota: UCL sezonu ~4 sayfa)', () => {
    expect(REFEREE_FIXTURE_QUERY.filters).toBe('fixtureStates:5,7,8;eventTypes:10,16,17,19,20,21;fixtureStatisticTypes:56');
    expect(REFEREE_FIXTURE_QUERY.include).toContain('referees.referee:');
  });
});
