/**
 * Ana sayfanın ilk ekranı (ISR, `pages/index.tsx` → `getStaticProps`): günün maç listesi, maç yoksa sıradaki maç
 * günü, varsayılan ligin puan durumu + sezonları ve kupa maçı varsa takım kademe haritası.
 *
 * - Veri `/api/matches/day`, `/api/matches/upcoming-days`, `/api/leagues/turkey-team-tiers` ve tarayıcı yan panelinin
 *   kullandığı fonksiyonlardan DOĞRUDAN gelir (kendi API'mize HTTP yok) → Sportmonks cache anahtarları aynı, ek
 *   upstream isteği yok.
 * - Props DETERMİNİSTİK: üretim zamanı / `Date.now()` girmez. İçerik değişmediyse Vercel ISR yazımı saymaz; tazelik
 *   kararını istemci verir (maçlar mount'ta tazelenir, yavaş değişen veriler taze sayılır — bkz. hooks/useHomeInitialSeed.ts).
 * - Liste satırının kullanmadığı alanlar atılır (yoğun cumartesi ~115 maç: 84 KB → bkz. testteki ölçüm).
 */
import type { Match } from '@/models/liveScore';
import type { TurkeyTeamTiersPayload } from '@/config/turkeyTiers';
import { loadHomeDay, loadUpcomingMatchDays } from '@/server/homeDay';
import { loadTurkeyTeamTiers } from '@/server/turkeyTeamTiers';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadCompetitionSidebar, type CompetitionSidebarData } from '@/hooks/useCompetitionSidebar';
import { packHomeMatches, stripUndefined, type HomeInitialData } from '@/utils/homeInitialData';
import { isTurkishCupMatch } from '@/utils/cupTeamTier';
import { hasActiveMatch, matchKickoffMs, ACTIVE_WINDOW_MS } from '@/utils/matchActivity';

// ─── Yeniden üretim süresi ─────────────────────────────────────────────────

export const HOME_REVALIDATE_ACTIVE = 120;
export const HOME_REVALIDATE_IDLE = 600;
export const HOME_REVALIDATE_FAILED = 60;

/**
 * Canlı maç ya da ±15 dk içinde başlama → 120 sn; aksi halde sıradaki maçın aktif penceresine kadar (en çok 600 sn,
 * en az 120). TR gece yarısını geçmesin: yeni günün HTML'i gecikmesin (en az 30 sn).
 */
export function homeRevalidateSeconds(matches: Pick<Match, 'status' | 'date' | 'scheduled'>[], now: number): number {
  let seconds: number;
  if (hasActiveMatch(matches, now)) {
    seconds = HOME_REVALIDATE_ACTIVE;
  } else {
    let untilActive = Infinity;
    for (const m of matches) {
      if (m.status !== 'NOT STARTED') continue;
      const k = matchKickoffMs(m);
      if (k != null && k > now) untilActive = Math.min(untilActive, (k - ACTIVE_WINDOW_MS - now) / 1000);
    }
    seconds = Math.max(HOME_REVALIDATE_ACTIVE, Math.min(HOME_REVALIDATE_IDLE, Math.floor(untilActive)));
  }
  return Math.min(seconds, Math.max(30, secondsUntilIstanbulMidnight(now) + 5));
}

/** Türkiye UTC+3 (yaz saati yok). */
export function secondsUntilIstanbulMidnight(now: number): number {
  const DAY = 86_400_000;
  const OFFSET = 3 * 3_600_000;
  const local = now + OFFSET;
  return Math.ceil((DAY - (local % DAY)) / 1000);
}

// ─── Yükleyici ──────────────────────────────────────────────────────────────

export class HomeInitialDataError extends Error {}

/** Listede o güne ait maç yok (sıradaki maç günü bildirimi gösterilecek) — başka günlerin canlı maçları sayılmaz. */
function isListDayEmpty(day: { fixtureMatches: Match[]; historyMatches?: Match[] }): boolean {
  return day.fixtureMatches.length === 0 && (day.historyMatches?.length ?? 0) === 0;
}

/**
 * Hata: maç verisi hiç alınamadıysa (upstream hatası + cache boş) ya da yan panel okunamadıysa fırlatır — çağıran
 * build sırasında boş kabuğa düşer, çalışma anındaki yeniden üretimde ise Next son başarılı sayfayı korur.
 */
export async function loadHomeInitialData(date: string, sidebarCompetitionId: number): Promise<{ data: HomeInitialData; revalidate: number }> {
  const { value, failed } = await trackSportmonksFetches(async () => {
    const [day, sidebar] = await Promise.all([loadHomeDay(date), loadCompetitionSidebar(sidebarCompetitionId)]);
    const empty = isListDayEmpty(day);
    const hasCup = [...day.fixtureMatches, ...day.liveMatches].some((m) => isTurkishCupMatch(m));
    const [upcoming, tiers] = await Promise.all([
      empty ? loadUpcomingMatchDays(date) : Promise.resolve(null),
      hasCup ? loadTurkeyTeamTiers() : Promise.resolve(null),
    ]);
    return { day, sidebar, upcoming, tiers };
  });

  const { day, sidebar, upcoming, tiers } = value;
  const dayEmpty = day.fixtureMatches.length + day.liveMatches.length + (day.historyMatches?.length ?? 0) === 0;
  // Yalnızca upstream HATASI fırlatır; gerçekten boş gün / sezon öncesi boş tablo normal içeriktir.
  if (failed && dayEmpty) throw new HomeInitialDataError('maç verisi alınamadı');
  if (failed && !sidebar.standings) throw new HomeInitialDataError('puan durumu alınamadı');

  const data: HomeInitialData = {
    date,
    matches: packHomeMatches(day),
    // Boş günde boş liste de bilgidir (bildirim yok); upstream hatasındaysa istemci kendisi çeksin.
    upcoming: isListDayEmpty(day) && !failed ? (upcoming ?? []) : null,
    sidebar: { competitionId: sidebarCompetitionId, data: stripUndefined(sidebar) as CompetitionSidebarData },
    // Eksik harita (bir lig okunamadı) gömülmez: istemcide 24 sa taze sayılırdı; istemci API'den çeksin (CDN 5 dk).
    cupTiers: tiers?.complete ? (stripUndefined(tiers.payload) as TurkeyTeamTiersPayload) : null,
  };
  return { data, revalidate: homeRevalidateSeconds([...day.fixtureMatches, ...day.liveMatches], Date.now()) };
}
