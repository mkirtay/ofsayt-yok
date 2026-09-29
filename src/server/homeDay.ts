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
import { isSportmonksProviderEnabled, VERIFIED_SPORTMONKS_LEAGUE_IDS } from '@/services/sportmonksProviderFlag';
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import { shiftIsoDate } from '@/utils/dateStrip';
import { matchListFreshSeconds } from '@/utils/matchActivity';

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
 * Sportmonks'ta tek fikstür isteği: eskiden aynı gün için `fixtures/between/{d}/{d}` + `fixtures/date/{d}`
 * ikisi de çekiliyordu (aynı veri, Pass 1 Genel Bulgu 2).
 */
export async function loadHomeDay(date: string): Promise<HomeDayPayload> {
  if (isSportmonksProviderEnabled()) {
    const [fixtureMatches, liveMatches] = await Promise.all([getFixturesByDate(date), getAllLiveMatches()]);
    return { date, fixtureMatches, liveMatches };
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

/** Pencere ve sayfa sınırı: 30 gün, en çok 3 × 50 maç (takip edilen 11 lig için ~2 hafta yeter). */
const UPCOMING_WINDOW_DAYS = 30;
const UPCOMING_MAX_PAGES = 3;

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

/**
 * `from`'dan SONRAKİ günlerde her takip edilen ligin ilk maç günü (Türkiye günü, artan tarih).
 * Tek sorgu: `fixtures/between/{from+1}/{from+30}?filters=fixtureLeagues:…&order=asc`, include yok
 * (yalnız `league_id` + `starting_at` gerekli), paylaşımlı cache'te 15 dk.
 */
export async function loadUpcomingMatchDays(from: string): Promise<UpcomingLeagueDay[]> {
  if (!isSportmonksProviderEnabled()) return [];
  const rows = await sportmonksCollectAllPages<Pick<SportmonksFixture, 'league_id' | 'starting_at'>>({
    basePath: 'football',
    path: `/fixtures/between/${shiftIsoDate(from, 1)}/${shiftIsoDate(from, UPCOMING_WINDOW_DAYS)}`,
    perPage: 50,
    maxPages: UPCOMING_MAX_PAGES,
    extraParams: { filters: `fixtureLeagues:${VERIFIED_SPORTMONKS_LEAGUE_IDS.join(',')}`, order: 'asc' },
  });
  const tracked = new Set(VERIFIED_SPORTMONKS_LEAGUE_IDS);
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
