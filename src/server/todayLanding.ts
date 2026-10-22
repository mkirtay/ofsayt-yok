/**
 * `/bugun` ("Bugün Scor3'te") veri yükleyicisi — sosyal profil bağlantısının açtığı hafif sayfa (ISR).
 *
 * YENİ Sportmonks istek türü yok, hepsi paylaşımlı önbellekteki mevcut anahtarlar:
 * - Günün maçları: `loadHomeDay` (ana sayfayla aynı `fixtures/date/{d}` listeleri + canlı liste).
 * - Yarın (bugün öne çıkan maç yoksa): Türkiye günü D+1 = UTC D 21:00 – UTC D+1 21:00 → `fixtures/date/{D}` ve
 *   `fixtures/date/{D+1}` — ikisi de `loadHomeDay(D)` içinde zaten okunuyor (gece maçları için).
 * - Türk takımı: `loadTurkeyTeamTiers` (`/api/leagues/turkey-team-tiers` ile aynı puan tablosu anahtarları).
 * - Derbi: `loadIsDerby` yalnız Süper Lig maçları için (takım `rivals`, 24 sa; maç kartının derbi rozetiyle ortak).
 */
import type { Match } from '@/models/liveScore';
import { getFixturesByDate } from '@/services/liveScoreService';
import { loadHomeDay } from '@/server/homeDay';
import { loadTurkeyTeamTiers } from '@/server/turkeyTeamTiers';
import { loadIsDerby } from '@/server/teamRivals';
import { homeRevalidateSeconds } from '@/server/homeInitialData';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { shiftIsoDate } from '@/utils/dateStrip';
import { matchIstanbulDate } from '@/utils/matchActivity';
import { buildMatchHref } from '@/utils/matchUrl';
import { utcTimeToTr } from '@/utils/dateFormat';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { selectTodayPicks, superLigMatches, type TodayPickTier } from '@/utils/todayPicks';

export type TodayLandingTeam = { name: string; logo?: string };

export type TodayLandingMatch = {
  id: number;
  href: string;
  home: TodayLandingTeam;
  away: TodayLandingTeam;
  competition: { name: string; logo?: string };
  /** TSİ başlama saati "HH:MM"; bilinmiyorsa yok. */
  time?: string;
  phase: 'PRE' | 'LIVE' | 'HT' | 'POST';
  /** Canlı / bitmiş maçta "2 - 1". */
  score?: string;
  /** Canlı dakika etiketi (ör. "67'"). */
  minute?: string;
  /** Türkiye yayıncıları — yalnız veride varsa (liste isteklerinde gelmez; bkz. rapor). */
  tv?: string[];
  tier: TodayPickTier;
};

export type TodayLandingData = {
  /** Gösterilen gün (YYYY-MM-DD, TSİ). */
  date: string;
  /** `today`: bugünün maçları; `tomorrow`: bugün öne çıkan yok, yarınınkiler. */
  day: 'today' | 'tomorrow';
  matches: TodayLandingMatch[];
};

export const TODAY_LANDING_REVALIDATE_FAILED = 60;

function team(t: Match['home'] | undefined, fallback?: string): TodayLandingTeam {
  return { name: t?.name || fallback || '—', ...(t?.logo ? { logo: t.logo } : {}) };
}

export function toLandingMatch(m: Match, tier: TodayPickTier): TodayLandingMatch {
  const phase = deriveMatchPhase(m.status);
  const time = m.scheduled && /^\d{2}:\d{2}/.test(m.scheduled) ? utcTimeToTr(m.scheduled.slice(0, 5), m.date) : undefined;
  const score = phase !== 'PRE' ? m.scores?.score?.trim() : undefined;
  return {
    id: Number(m.id),
    href: buildMatchHref(m),
    home: team(m.home, m.home_name),
    away: team(m.away, m.away_name),
    competition: { name: m.competition?.name || m.competition_name || '', ...(m.competition?.logo ? { logo: m.competition.logo } : {}) },
    ...(time ? { time } : {}),
    phase,
    ...(score ? { score } : {}),
    ...((phase === 'LIVE' || phase === 'HT') && m.time ? { minute: m.time } : {}),
    ...(m.tv_stations?.length ? { tv: m.tv_stations.slice(0, 2) } : {}),
    tier,
  };
}

async function derbyIds(matches: readonly Match[]): Promise<Set<number>> {
  const out = new Set<number>();
  await Promise.all(
    superLigMatches(matches).map(async (m) => {
      const h = m.home?.id ?? m.home_id;
      const a = m.away?.id ?? m.away_id;
      if (h == null || a == null) return;
      if (await loadIsDerby(h, a)) out.add(Number(m.id));
    }),
  );
  return out;
}

async function pick(matches: Match[], turkish: ReadonlySet<number>) {
  return selectTodayPicks(matches, { turkishTeamIds: turkish, derbyMatchIds: await derbyIds(matches) });
}

/**
 * Hata: günün maçları hiç alınamadıysa (upstream hatası + önbellek boş) fırlatır — ISR son başarılı sayfayı korur.
 * Türk takımı haritası / derbi okunamazsa sıralama bir kademe aşağı düşer (sayfa yine çizilir).
 */
export async function loadTodayLanding(today: string, now: number = Date.now()): Promise<{ data: TodayLandingData; revalidate: number }> {
  const { value, failed } = await trackSportmonksFetches(async () => {
    const [day, tiers] = await Promise.all([loadHomeDay(today), loadTurkeyTeamTiers().catch(() => null)]);
    const turkish = new Set(Object.keys(tiers?.payload.tiers ?? {}).map(Number));
    const todayMatches = [...day.fixtureMatches, ...day.liveMatches.filter((m) => matchIstanbulDate(m) === today)];
    const todayPicks = await pick(todayMatches, turkish);
    if (todayPicks.length > 0) return { date: today, day: 'today' as const, picks: todayPicks, all: todayMatches };
    const tomorrow = shiftIsoDate(today, 1);
    const [utcToday, utcTomorrow] = await Promise.all([getFixturesByDate(today), getFixturesByDate(tomorrow)]);
    const tomorrowMatches = [...utcToday, ...utcTomorrow].filter((m) => matchIstanbulDate(m) === tomorrow);
    return { date: tomorrow, day: 'tomorrow' as const, picks: await pick(tomorrowMatches, turkish), all: [...todayMatches, ...tomorrowMatches] };
  });
  if (failed && value.all.length === 0) throw new Error('bugun: maç verisi alınamadı');
  return {
    data: { date: value.date, day: value.day, matches: value.picks.map((p) => toLandingMatch(p.match, p.tier)) },
    revalidate: homeRevalidateSeconds(value.picks.map((p) => p.match), now),
  };
}
