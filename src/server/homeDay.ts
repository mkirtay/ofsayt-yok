/**
 * Ana sayfanın normalize veri kaynağı (`/api/matches/day`, `/api/matches/upcoming-days`).
 * Tarayıcı ham Sportmonks path'leri yerine bunları çağırır: sağlayıcı değişirse yalnızca bu dosya ve
 * servis katmanı değişir; cevaplar zaten domain `Match`'e eşlenmiş ve küçük.
 */
import type { Match } from '@/models/liveScore';
import {
  getAllLiveMatches,
  getAllMatchesByDate,
  getFixturesByCompetition,
  getFixturesByDate,
} from '@/services/liveScoreService';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';
import { PLAN_SPORTMONKS_LEAGUE_IDS } from '@/config/leagueNameKeys';
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import { shiftIsoDate } from '@/utils/dateStrip';
import { matchIstanbulDate, matchListFreshSeconds } from '@/utils/matchActivity';

export type HomeDayPayload = {
  date: string;
  /** Günün fikstürü (Sportmonks: `fixtures/date/{date}`, tüm sayfalar). */
  fixtureMatches: Match[];
  /** O an canlı maçlar (tüm tarihler). */
  liveMatches: Match[];
  /** Yalnız eski sağlayıcıda: günün geçmiş sayfaları. Sportmonks'ta fikstür listesiyle aynı veri → yok. */
  historyMatches?: Match[];
};

/**
 * `date` TÜRKİYE günü; Sportmonks `fixtures/date/{d}` ise UTC günü döndürür. Türkiye günü D = UTC D−1'in
 * 21:00'ından UTC D'nin 21:00'ına kadar → iki UTC listesi alınıp başlama saati Türkiye'de D'ye düşenler
 * tutulur (ör. 30 Eylül 23:30 UTC maçı 1 Ekim 02:30'dur). İki liste de paylaşımlı cache'te, komşu
 * günlerle ortak. `timezone=Europe/Istanbul` parametresi kullanılmadı: saatleri de yerel döndürüyor, oysa
 * mapper ve arayüz `starting_at`'i UTC varsayıyor. Aynı gün için `between` ayrıca çekilmiyor (aynı veri).
 */
export async function loadHomeDay(date: string): Promise<HomeDayPayload> {
  if (isSportmonksProviderEnabled()) {
    const [previousUtcDay, sameUtcDay, liveMatches] = await Promise.all([
      getFixturesByDate(shiftIsoDate(date, -1)),
      getFixturesByDate(date),
      getAllLiveMatches(),
    ]);
    const byId = new Map<number, Match>();
    for (const m of [...previousUtcDay, ...sameUtcDay]) {
      if (matchIstanbulDate(m) === date) byId.set(Number(m.id), m);
    }
    return { date, fixtureMatches: [...byId.values()], liveMatches };
  }

  // Eski sağlayıcı: `/fixtures/list` sayfalı ve Dünya Kupası 2. sayfaya düşebiliyor → rekabet fikstürüyle tamamla.
  const [historyMatches, liveMatches, dateFixtures, worldCup] = await Promise.all([
    getAllMatchesByDate(date, 5),
    getAllLiveMatches(),
    getFixturesByDate(date),
    getFixturesByCompetition(WORLD_CUP_COMPETITION_ID),
  ]);
  const ids = new Set(dateFixtures.map((m) => Number(m.id)));
  const fixtureMatches = [...dateFixtures, ...worldCup.filter((m) => m.date === date && !ids.has(Number(m.id)))];
  return { date, fixtureMatches, liveMatches, historyMatches };
}

/**
 * CDN süresi (sn): canlı maç varsa 20 (canlı skor TTL'i), aktif liste 30, aksi halde sıradaki başlamaya
 * kadar — bugün/yarın/dün en çok 5 dk, gelecek günler 15 dk, geçmiş günler 1 sa.
 */
export function homeDayFreshSeconds(payload: HomeDayPayload, todayIso: string, now: number = Date.now()): number {
  const { date } = payload;
  const max = date < shiftIsoDate(todayIso, -1) ? 3600 : date > shiftIsoDate(todayIso, 1) ? 900 : 300;
  const fresh = matchListFreshSeconds([...payload.fixtureMatches, ...payload.liveMatches], max, now);
  return payload.liveMatches.length > 0 ? Math.min(fresh, 20) : fresh;
}

// ─── Sıradaki maç günü ──────────────────────────────────────────────────────

export type UpcomingLeagueDay = { leagueId: number; date: string };

/** "Tümü": `from`'dan 30 gün, artan sırada ilk 50 maç (en yakın gün için yeter). */
const UPCOMING_WINDOW_DAYS = 30;
/** Lig başına takvim: UTC dün … +45 gün, en çok 3 × 50 maç; anahtar yalnız lig + gün (seçili günden bağımsız). */
const LEAGUE_SCHEDULE_PAST_DAYS = 1;
const LEAGUE_SCHEDULE_FUTURE_DAYS = 45;
const LEAGUE_SCHEDULE_MAX_PAGES = 3;
/** Lig başına takvim istekleri aynı anda en çok bu kadar (34 ligli filtre upstream'e yığılmasın). */
const LEAGUE_SCHEDULE_CONCURRENCY = 4;
const PLAN_LEAGUES = new Set(PLAN_SPORTMONKS_LEAGUE_IDS);

/**
 * İstemcinin lig filtresi → planımızdaki liglerle sınırlı, sıralı, tekil id listesi (cache anahtarı sabit olsun).
 * `null` = filtre yok ("Tümü"); filtre verildi ama hiçbiri planda değilse boş dizi.
 */
export function normalizeUpcomingLeagueIds(ids: Iterable<number> | null | undefined): number[] | null {
  if (ids == null) return null;
  return [...new Set([...ids].filter((id) => PLAN_LEAGUES.has(id)))].sort((a, b) => a - b);
}

const istanbulDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Sportmonks `starting_at` (UTC, "YYYY-MM-DD HH:mm:ss") → Türkiye günü (ana sayfanın tarih şeridiyle aynı gün). */
export function istanbulDateOfKickoff(startingAt: string): string | null {
  const t = Date.parse(`${startingAt.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? istanbulDay.format(new Date(t)) : null;
}

type ScheduleRow = Pick<SportmonksFixture, 'league_id' | 'starting_at'>;

/** Satırlardan lig başına `from`'dan sonraki ilk Türkiye günü (artan tarih, eşitlikte lig id). */
function firstDaysAfter(rows: ScheduleRow[], from: string, tracked: ReadonlySet<number>): UpcomingLeagueDay[] {
  const first = new Map<number, string>();
  for (const r of rows) {
    if (r.league_id == null || !tracked.has(r.league_id) || !r.starting_at) continue;
    const day = istanbulDateOfKickoff(r.starting_at);
    if (!day || day <= from) continue;
    const prev = first.get(r.league_id);
    if (!prev || day < prev) first.set(r.league_id, day);
  }
  return [...first.entries()]
    .map(([leagueId, date]) => ({ leagueId, date }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.leagueId - b.leagueId);
}

/**
 * Bir ligin yakın takvimi — anahtar yalnız lig + bugünün UTC günü: farklı lig kombinasyonları ve farklı seçili günler
 * aynı girdileri paylaşır (bot kombinasyon deneyerek yeni Sportmonks isteği üretemez; en çok 34 lig × 3 sayfa / 15 dk).
 * Include'suz `between` → yalnız takvim, cache 15 dk (bkz. cachePolicy).
 */
async function loadLeagueSchedule(leagueId: number, todayUtc: string): Promise<ScheduleRow[]> {
  return sportmonksCollectAllPages<ScheduleRow>({
    basePath: 'football',
    path: `/fixtures/between/${shiftIsoDate(todayUtc, -LEAGUE_SCHEDULE_PAST_DAYS)}/${shiftIsoDate(todayUtc, LEAGUE_SCHEDULE_FUTURE_DAYS)}`,
    perPage: 50,
    maxPages: LEAGUE_SCHEDULE_MAX_PAGES,
    extraParams: { filters: `fixtureLeagues:${leagueId}`, order: 'asc' },
  });
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * `from`'dan SONRAKİ günlerde liglerin ilk maç günü (Türkiye günü, artan tarih).
 * - `leagueIds` null ("Tümü"): planımızdaki BÜTÜN ligler (ana sayfa listesi gibi) — `fixtures/between` lig süzgeçsiz,
 *   artan sırada TEK sayfa; en yakın maç günü ilk satırlarda.
 * - `leagueIds` dolu (lig filtresi): her lig kendi takviminden (`loadLeagueSchedule`, lig başına cache), sonuç
 *   birleştirilir. Pencere bugünden +45 gün; daha uzak ilk maç günü gösterilmez.
 */
export async function loadUpcomingMatchDays(
  from: string,
  leagueIds: number[] | null = null,
  now: number = Date.now(),
): Promise<UpcomingLeagueDay[]> {
  if (!isSportmonksProviderEnabled()) return [];
  if (leagueIds) {
    if (leagueIds.length === 0) return [];
    const todayUtc = new Date(now).toISOString().slice(0, 10);
    const perLeague = await mapWithConcurrency(leagueIds, LEAGUE_SCHEDULE_CONCURRENCY, (id) => loadLeagueSchedule(id, todayUtc));
    return firstDaysAfter(perLeague.flat(), from, new Set(leagueIds));
  }
  const rows = await sportmonksCollectAllPages<ScheduleRow>({
    basePath: 'football',
    // UTC `from`'dan başla: TR'de `from+1` günü UTC `from` 21:00'de başlar (ör. 30 Eylül 23:30 UTC MLS maçı TR'de
    // 1 Ekim 02:30). TR gününe göre `> from` süzgeci `firstDaysAfter`'da; uç yalnızca seçili gün boşken çağrıldığı
    // için UTC `from`'un geri kalanı ilk sayfayı doldurmaz.
    path: `/fixtures/between/${from}/${shiftIsoDate(from, UPCOMING_WINDOW_DAYS)}`,
    perPage: 50,
    maxPages: 1,
    extraParams: { order: 'asc' },
  });
  return firstDaysAfter(rows, from, PLAN_LEAGUES);
}
