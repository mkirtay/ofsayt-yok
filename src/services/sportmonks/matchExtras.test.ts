import { describe, expect, it } from 'vitest';
import type { SportmonksFixture } from './types';
import {
  FIXTURE_DETAIL_EXTRA_FILTERS,
  FIXTURE_DETAIL_EXTRA_INCLUDE,
  FIXTURE_TV_INCLUDE,
  keepTurkeyTvStations,
  wantsTvStations,
  mapFixtureCoaches,
  mapFixtureHashtag,
  mapFixtureWeather,
  mapMatchExtras,
  mapTurkeyTvStations,
  weatherConditionFromIcon,
} from './matchExtras';
import { checkProxyAllowlist } from '@/server/sportmonks/proxyAllowlist';

// Gerçek yanıtlardan kısaltılmış (2026-10-04): 19746609 Trabzonspor–Galatasaray (bitmiş), 19746594 GS–Kasımpaşa.
const finished = {
  id: 19746609,
  tvstations: [
    { tvstation_id: 36, country_id: 404, tvstation: { id: 36, name: 'beIN Sports 1' } },
    { tvstation_id: 9, country_id: 462, tvstation: { id: 9, name: 'Sport TV' } },
    { tvstation_id: 36, country_id: 404, tvstation: { id: 36, name: 'beIN Sports 1' } },
    { tvstation_id: 878, country_id: 404, tvstation: { id: 878, name: 'TOD' } },
  ],
  coaches: [
    { id: 199988, common_name: 'O. Buruk', display_name: 'Okan Buruk', meta: { participant_id: 34 } },
    { id: 3861734, common_name: 'T. Reis', meta: { participant_id: 688 } },
  ],
  weatherreport: { temperature: { current: 22.09 }, description: 'overcast clouds', icon: 'https://cdn.sportmonks.com/images/weather/04n.png' },
  metadata: [{ type_id: 613, values: '#TRAGAL' }],
  referees: [
    { referee_id: 15820, type_id: 7 },
    { referee_id: 62331, type_id: 6 },
  ],
} as unknown as SportmonksFixture;

describe('maç detayı ekleri (TV / teknik direktör / hava / hashtag / hakem id)', () => {
  it('yalnız Türkiye yayıncıları, ada göre tekil', () => {
    expect(mapTurkeyTvStations(finished)).toEqual(['beIN Sports 1', 'TOD']);
    expect(mapTurkeyTvStations({ tvstations: [{ tvstation_id: 9, country_id: 462, tvstation: { name: 'Sport TV' } }] })).toEqual([]);
  });

  it('teknik direktör takımı participant_id ile', () => {
    expect(mapFixtureCoaches(finished, 688, 34)).toEqual({ home: 'T. Reis', homeId: 3861734, away: 'O. Buruk', awayId: 199988, awayFull: 'Okan Buruk' });
    expect(mapFixtureCoaches({ coaches: [] }, 1, 2)).toBeUndefined();
  });

  it('hava: sıcaklık yuvarlanır, durum ikon kodundan; başlamamış maçta null → yok', () => {
    expect(mapFixtureWeather(finished)).toEqual({ tempC: 22, condition: 'cloudy' });
    expect(mapFixtureWeather({ weatherreport: null })).toBeUndefined();
    expect(weatherConditionFromIcon('https://x/weather/01d.png')).toBe('clear');
    expect(weatherConditionFromIcon('https://x/weather/10n.png')).toBe('rain');
    expect(weatherConditionFromIcon('https://x/weather/99d.png')).toBeUndefined();
  });

  it('hashtag yalnız tür 613 ve geçerli biçimde', () => {
    expect(mapFixtureHashtag(finished)).toBe('#TRAGAL');
    expect(mapFixtureHashtag({ metadata: [{ type_id: 572, values: { confirmed: true } }] })).toBeUndefined();
    expect(mapFixtureHashtag({ metadata: [{ type_id: 613, values: 'not a tag <script>' }] })).toBeUndefined();
  });

  it('Match alanları: dolu olanlar; liste isteğinde (ek include yok) yalnız hakem id', () => {
    expect(mapMatchExtras(finished, 688, 34)).toEqual({
      tv_stations: ['beIN Sports 1', 'TOD'],
      coaches: { home: 'T. Reis', homeId: 3861734, away: 'O. Buruk', awayId: 199988, awayFull: 'Okan Buruk' },
      weather: { tempC: 22, condition: 'cloudy' },
      hashtag: '#TRAGAL',
      referee_id: 62331,
    });
    expect(mapMatchExtras({ id: 1 } as SportmonksFixture, 1, 2)).toEqual({});
  });

  it('sunucu süzgeci: tek fixture ve listede yalnız Türkiye satırları kalır; yayıncısız yanıt aynen', () => {
    const body = { data: finished };
    const out = keepTurkeyTvStations(body) as { data: SportmonksFixture };
    expect(out.data.tvstations!.map((r) => r.country_id)).toEqual([404, 404, 404]);
    const list = keepTurkeyTvStations({ data: [finished] }) as { data: SportmonksFixture[] };
    expect(list.data[0]!.tvstations).toHaveLength(3);
    const plain = { data: { id: 1 } };
    expect(keepTurkeyTvStations(plain)).toEqual(plain);
    expect(keepTurkeyTvStations(null)).toBeNull();
  });

  it('yayıncı yalnız başlamamış / canlı maçta istenir; detay isteğinde yayıncı include yok', () => {
    expect(wantsTvStations('NOT STARTED')).toBe(true);
    expect(wantsTvStations('IN PLAY')).toBe(true);
    expect(wantsTvStations('HALF TIME BREAK')).toBe(true);
    expect(wantsTvStations('FINISHED')).toBe(false);
    expect(FIXTURE_DETAIL_EXTRA_INCLUDE).not.toContain('tvStations');
  });

  it('tarayıcı proxy izin listesi detay isteğini kabul eder', () => {
    const include = `participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group;aggregate;events;${FIXTURE_DETAIL_EXTRA_INCLUDE}`;
    const r = checkProxyAllowlist('football/fixtures/19746594', { include, filters: FIXTURE_DETAIL_EXTRA_FILTERS });
    expect(r.violations).toEqual([]);
    expect(r.allowed).toBe(true);
    expect(checkProxyAllowlist('football/fixtures/19746594', { include: FIXTURE_TV_INCLUDE }).violations).toEqual([]);
  });
});
