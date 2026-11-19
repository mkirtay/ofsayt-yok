/**
 * Hakem tablosu — fikstür kaynağı (UEFA kupaları ve büyük Avrupa ligleri; bkz. config/refereeTableLeagues.ts `source`).
 *
 * Sezonun BİTMİŞ maçları tek uçtan, 50'lik sayfalarla: `fixtures?filters=fixtureSeasons:{id};fixtureStates:5,7,8` +
 * olay türü süzgeci (yalnız kart / penaltı / VAR) + faul istatistiği süzgeci + orta hakem adı/ülkesi. 2026-11-19 ölçümü:
 * UCL 2026/27 162 maç = 4 sayfa (~180 KB/sayfa). Hakem başına `referees/{id}` (UCL'de ~390 görevli) atılmaz.
 *
 * Sayılar Sportmonks'un hakem sezon kaydıyla aynı tanımlarla hesaplanır (Süper Lig 2026/27'de karşılaştırıldı: maç, faul,
 * penaltı birebir; sarı kartta 25 hakemin 3'ünde ±1–2 fark — sezon kaydı olay akışından ayrı güncelleniyor):
 * - sarı = 19 (YELLOWCARD); kırmızı = 20 (REDCARD) + 21 (YELLOWREDCARD); penaltı = 16 (gol) + 17 (kaçan); VAR = 10.
 * - VAR iptal edilen (`rescinded`) olay sayılmaz.
 * - Faul: iki takımın 56 (FOULS) istatistiği; ortalama yalnız faul verisi olan maçlar üzerinden.
 * - VAR: ligde sezon boyunca hiç VAR olayı yoksa (VAR'sız eleme turları vb.) sütun boş (null), varsa sayı / maç.
 */
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import { REFEREE_TYPE_IDS } from '@/services/sportmonks/refereeFormatter';
import { personSlug } from '@/utils/personUrl';
import { personPhoto } from '@/utils/personPhoto';
import type { RefereeSeasonLine } from '@/services/sportmonks/refereeStats';

const EVENT = { VAR: 10, PEN_GOAL: 16, PEN_MISS: 17, YELLOW: 19, RED: 20, YELLOW_RED: 21 } as const;
const FOULS_STAT = 56;
const TURKEY_COUNTRY_ID = 404;
const PER_PAGE = 50;
/** Lig sezonu en çok 380 maç (8 sayfa); güvenlik ağı. */
const MAX_PAGES = 12;

export const REFEREE_FIXTURE_QUERY = {
  filters: `fixtureStates:5,7,8;eventTypes:${Object.values(EVENT).join(',')};fixtureStatisticTypes:${FOULS_STAT}`,
  include: [
    'participants:name,image_path,country_id',
    'referees:referee_id,type_id',
    'referees.referee:display_name,common_name,image_path,country_id',
    'referees.referee.country:name,iso2,image_path',
    'events:type_id,rescinded',
    'statistics:type_id,data',
  ].join(';'),
  select: 'id,state_id,starting_at',
} as const;

type RawCountry = { name?: string | null; iso2?: string | null; image_path?: string | null };
type RawRefPerson = { id?: number; display_name?: string | null; common_name?: string | null; image_path?: string | null; country?: RawCountry | null };
export type RawRefereeTableFixture = {
  id: number;
  starting_at?: string | null;
  participants?: { id?: number; name?: string | null; image_path?: string | null; country_id?: number | null; meta?: { location?: string | null } | null }[] | null;
  referees?: { referee_id?: number; type_id?: number; referee?: RawRefPerson | null }[] | null;
  events?: { type_id?: number; rescinded?: boolean | null }[] | null;
  statistics?: { type_id?: number; data?: { value?: unknown } | null }[] | null;
};

export type PersonCountry = { name: string; iso2?: string; flag?: string };

/** Türk takımlarının bu sezonki maçları ve orta hakemi (UEFA tablosunun yan paneli). */
export type RefereeTableTrMatch = {
  fixtureId: number;
  startingAt: string | null;
  home: { id: number; name: string; logo?: string };
  away: { id: number; name: string; logo?: string };
  referee: { id: number; name: string; slug: string } | null;
};

export type FixtureTableRow = RefereeSeasonLine & { refereeId: number; name: string; slug: string; country?: PersonCountry; photo?: string };

export function countryOf(c: RawCountry | null | undefined): PersonCountry | undefined {
  if (!c?.name) return undefined;
  return { name: c.name, ...(c.iso2 ? { iso2: c.iso2 } : {}), ...(c.image_path ? { flag: c.image_path } : {}) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function side(f: RawRefereeTableFixture, location: 'home' | 'away') {
  const list = f.participants ?? [];
  const p = list.find((x) => x.meta?.location === location) ?? list[location === 'home' ? 0 : 1];
  if (!p?.id) return null;
  return { id: p.id, name: p.name ?? '', ...(p.image_path ? { logo: p.image_path } : {}) };
}

function mainReferee(f: RawRefereeTableFixture) {
  return (f.referees ?? []).find((r) => r.type_id === REFEREE_TYPE_IDS.MAIN && r.referee_id) ?? null;
}

/** Bitmiş maçlardan hakem satırları (maç sayısına göre sırası çağıranda) + Türk takımlarının maçları. */
export function refereeTableFromFixtures(
  fixtures: readonly RawRefereeTableFixture[],
  season: { id: number; name: string },
): { rows: FixtureTableRow[]; trMatches: RefereeTableTrMatch[] } {
  type Acc = { m: number; y: number; r: number; p: number; v: number; fouls: number; foulMatches: number; person: RawRefPerson | null | undefined };
  const acc = new Map<number, Acc>();
  let leagueVar = 0;
  const trMatches: RefereeTableTrMatch[] = [];
  const seen = new Set<number>();

  for (const f of fixtures) {
    if (!f?.id || seen.has(f.id)) continue;
    seen.add(f.id);
    const main = mainReferee(f);
    const refId = main?.referee_id;
    if (refId) {
      const a = acc.get(refId) ?? { m: 0, y: 0, r: 0, p: 0, v: 0, fouls: 0, foulMatches: 0, person: main.referee };
      a.m += 1;
      if (!a.person && main.referee) a.person = main.referee;
      for (const e of f.events ?? []) {
        if (e.rescinded) continue;
        if (e.type_id === EVENT.YELLOW) a.y += 1;
        else if (e.type_id === EVENT.RED || e.type_id === EVENT.YELLOW_RED) a.r += 1;
        else if (e.type_id === EVENT.PEN_GOAL || e.type_id === EVENT.PEN_MISS) a.p += 1;
        else if (e.type_id === EVENT.VAR) {
          a.v += 1;
          leagueVar += 1;
        }
      }
      const fouls = (f.statistics ?? []).filter((s) => s.type_id === FOULS_STAT && typeof s.data?.value === 'number');
      if (fouls.length) {
        a.fouls += fouls.reduce((n, s) => n + (s.data!.value as number), 0);
        a.foulMatches += 1;
      }
      acc.set(refId, a);
    }
    if ((f.participants ?? []).some((p) => p.country_id === TURKEY_COUNTRY_ID)) {
      const home = side(f, 'home');
      const away = side(f, 'away');
      if (home && away) {
        const name = main?.referee?.display_name ?? main?.referee?.common_name ?? '';
        trMatches.push({
          fixtureId: f.id,
          startingAt: f.starting_at ?? null,
          home,
          away,
          referee: refId && name ? { id: refId, name, slug: personSlug(name, refId) } : null,
        });
      }
    }
  }

  const rows: FixtureTableRow[] = [];
  for (const [refereeId, a] of acc) {
    const name = a.person?.display_name ?? a.person?.common_name ?? '';
    if (!name) continue;
    const country = countryOf(a.person?.country);
    const photo = personPhoto(a.person?.image_path);
    rows.push({
      seasonId: season.id,
      seasonName: season.name,
      matches: a.m,
      yellowPerMatch: round2(a.y / a.m),
      redPerMatch: round2(a.r / a.m),
      penaltiesPerMatch: round2(a.p / a.m),
      foulsPerMatch: a.foulMatches > 0 ? round2(a.fouls / a.foulMatches) : null,
      varPerMatch: leagueVar > 0 ? round2(a.v / a.m) : null,
      refereeId,
      name,
      slug: personSlug(name, refereeId),
      ...(country ? { country } : {}),
      ...(photo ? { photo } : {}),
    });
  }
  trMatches.sort((x, y) => String(y.startingAt ?? '').localeCompare(String(x.startingAt ?? '')));
  return { rows, trMatches };
}

/** `null`: istek hatası (tablo yazılmaz, eski kayıt kalır). */
export async function loadRefereeFixtureTable(season: { id: number; name: string }): Promise<{ rows: FixtureTableRow[]; trMatches: RefereeTableTrMatch[] } | null> {
  const fixtures = await sportmonksCollectAllPages<RawRefereeTableFixture>({
    basePath: 'football',
    path: '/fixtures',
    perPage: PER_PAGE,
    maxPages: MAX_PAGES,
    extraParams: { ...REFEREE_FIXTURE_QUERY, filters: `fixtureSeasons:${season.id};${REFEREE_FIXTURE_QUERY.filters}` },
  }).catch(() => null);
  if (!fixtures) return null;
  return refereeTableFromFixtures(fixtures, season);
}
