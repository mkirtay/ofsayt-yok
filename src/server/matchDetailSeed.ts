import type { MatchLineupData, MatchStatsData } from '@/models/domain';
import { fetchMatchLineups, fetchMatchStats } from '@/services/liveScoreService';

/** Maç sayfası istatistik + kadro için SSR bütçesi (form / karşılaşma geçmişiyle aynı, paralel çalışır). */
export const MATCH_DETAIL_SEED_BUDGET_MS = 400;

export type MatchDetailServerSeed = {
  /** `undefined`: bütçe aşıldı ya da geçici hata → istemci çeker. `null`: veri yok (kart boş durumunu çizer). */
  stats: MatchStatsData | null | undefined;
  lineups: MatchLineupData | null | undefined;
  /** En az bir istek geçici hata verdi (429 / 5xx / zaman aşımı) — "veri yok" DEĞİL; sayfa CDN'de kısa tutulur. */
  failed?: boolean;
};

type Budgeted<T> = { value: T | undefined; failed: boolean };

async function withinBudget<T>(fn: () => Promise<T>, budgetMs: number): Promise<Budgeted<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Budgeted<T>>((resolve) => {
    timer = setTimeout(() => resolve({ value: undefined, failed: false }), budgetMs);
  });
  try {
    return await Promise.race([fn().then((value) => ({ value, failed: false })), timeout]);
  } catch {
    return { value: undefined, failed: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * İstatistik ve kadro SSR'da: istemci çekince Genel Bakış'taki kartlar iskeletten gerçek boya uzuyor, altındaki
 * kadro kutusu (masaüstünde ilk ekranda görünür) aşağı itiliyordu (CLS 0,01–0,07). Olaylar zaten maçı çözen
 * `fixtures/{id}` isteğinde geliyor (bkz. resolveMatchPage). Aynı `fixtures/{id}?include=…` istekleri → aynı sunucu
 * cache katmanı (proxy ile ortak); bütçe aşılırsa istek arka planda sürer ve cache'i ısıtır.
 */
export async function loadMatchDetailSeed(
  matchId: string,
  budgetMs = MATCH_DETAIL_SEED_BUDGET_MS,
): Promise<MatchDetailServerSeed> {
  const [stats, lineups] = await Promise.all([
    withinBudget(() => fetchMatchStats(matchId), budgetMs),
    withinBudget(() => fetchMatchLineups(matchId), budgetMs),
  ]);
  return { stats: stats.value, lineups: lineups.value, ...(stats.failed || lineups.failed ? { failed: true } : {}) };
}
