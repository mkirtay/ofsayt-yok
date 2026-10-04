/**
 * Maç detayının ek alanları (yalnız `fixtures/{id}` detay isteği — liste istekleri bu include'ları istemez):
 * Türkiye yayıncıları, teknik direktörler, hava, resmî hashtag, orta hakem id'si.
 *
 * 2026-10-04 gerçek isteklerle doğrulandı (Süper Lig 19746609 bitmiş / 19746594 başlamamış):
 * - `tvStationCountries` filtresi 400 ("not applicable") → ülke süzgeci burada (`country_id`). Aynı kanal farklı
 *   satırlarda tekrarlanabiliyor ("beIN Sports 1" ×3) → ada göre tekil.
 * - `coaches[].meta.participant_id` takımı verir.
 * - `weatherreport` başlamamış maçta (günler varken) `null`; `description` İngilizce → durum OpenWeather ikon kodundan.
 * - metadata tür 613 = hashtag (`values: "#GALKAS"`).
 */
import type { Match, MatchWeather, MatchWeatherCondition } from '@/models/liveScore';
import type { SportmonksFixture } from './types';
import { REFEREE_TYPE_IDS } from './refereeFormatter';

/** Sportmonks ülke id'si: Türkiye. */
export const SPORTMONKS_TURKEY_COUNTRY_ID = 404;
/** metadata türü: maçın resmî hashtag'i. */
export const METADATA_HASHTAG_TYPE_ID = 613;

/**
 * Maç detayı isteğine eklenen include'lar + metadata süzgeci (yalnız hashtag satırı). Alan seçimleri yanıtı küçültür
 * (bitmiş maçta ~160 yayıncı satırı: 57 KB → 39 KB).
 */
export const FIXTURE_DETAIL_EXTRA_INCLUDE = 'tvStations.tvStation:name;coaches:common_name;weatherReport;metadata';
export const FIXTURE_DETAIL_EXTRA_FILTERS = `metadataTypes:${METADATA_HASHTAG_TYPE_ID}`;

export function mapTurkeyTvStations(fixture: Pick<SportmonksFixture, 'tvstations'>): string[] {
  const out: string[] = [];
  for (const row of fixture.tvstations ?? []) {
    if (row.country_id !== SPORTMONKS_TURKEY_COUNTRY_ID) continue;
    const name = row.tvstation?.name?.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function mapFixtureCoaches(
  fixture: Pick<SportmonksFixture, 'coaches'>,
  homeId: number | undefined,
  awayId: number | undefined,
): Match['coaches'] | undefined {
  let home: string | undefined;
  let away: string | undefined;
  for (const c of fixture.coaches ?? []) {
    const name = c.common_name?.trim();
    if (!name) continue;
    const team = c.meta?.participant_id;
    if (team != null && team === homeId) home = name;
    else if (team != null && team === awayId) away = name;
  }
  return home || away ? { ...(home ? { home } : {}), ...(away ? { away } : {}) } : undefined;
}

/** OpenWeather ikon kodu (`01d`…`50n`) → kısa durum. */
export function weatherConditionFromIcon(icon: string | null | undefined): MatchWeatherCondition | undefined {
  const code = /\/(\d{2})[dn]\.png$/.exec(icon ?? '')?.[1];
  switch (code) {
    case '01':
      return 'clear';
    case '02':
      return 'partlyCloudy';
    case '03':
    case '04':
      return 'cloudy';
    case '09':
    case '10':
      return 'rain';
    case '11':
      return 'storm';
    case '13':
      return 'snow';
    case '50':
      return 'fog';
    default:
      return undefined;
  }
}

export function mapFixtureWeather(fixture: Pick<SportmonksFixture, 'weatherreport'>): MatchWeather | undefined {
  const w = fixture.weatherreport;
  const t = w?.temperature?.current ?? w?.temperature?.day;
  if (typeof t !== 'number' || !Number.isFinite(t)) return undefined;
  const condition = weatherConditionFromIcon(w?.icon);
  return { tempC: Math.round(t), ...(condition ? { condition } : {}) };
}

export function mapFixtureHashtag(fixture: Pick<SportmonksFixture, 'metadata'>): string | undefined {
  const row = fixture.metadata?.find((m) => m.type_id === METADATA_HASHTAG_TYPE_ID);
  const v = typeof row?.values === 'string' ? row.values.trim() : '';
  return /^#[\p{L}\p{N}_]{2,40}$/u.test(v) ? v : undefined;
}

export function mapMainRefereeId(fixture: Pick<SportmonksFixture, 'referees'>): number | undefined {
  return fixture.referees?.find((r) => r.type_id === REFEREE_TYPE_IDS.MAIN)?.referee_id;
}

/** Eşleyiciye eklenen alanlar — yalnız dolu olanlar (liste isteklerinde hepsi boş → `Match` değişmez). */
export function mapMatchExtras(fixture: SportmonksFixture, homeId: number | undefined, awayId: number | undefined): Partial<Match> {
  const tv = mapTurkeyTvStations(fixture);
  const coaches = mapFixtureCoaches(fixture, homeId, awayId);
  const weather = mapFixtureWeather(fixture);
  const hashtag = mapFixtureHashtag(fixture);
  const refereeId = mapMainRefereeId(fixture);
  return {
    ...(tv.length ? { tv_stations: tv } : {}),
    ...(coaches ? { coaches } : {}),
    ...(weather ? { weather } : {}),
    ...(hashtag ? { hashtag } : {}),
    ...(refereeId != null ? { referee_id: refereeId } : {}),
  };
}
