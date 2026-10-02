import type { MatchLineupData, MatchStatsData } from '@/models/domain';
import { getMatchLineups, getMatchStats } from '@/services/liveScoreService';

/** Maç sayfası istatistik + kadro için SSR bütçesi (form / karşılaşma geçmişiyle aynı, paralel çalışır). */
export const MATCH_DETAIL_SEED_BUDGET_MS = 400;

export type MatchDetailServerSeed = {
  /** `undefined`: bütçe aşıldı → istemci çeker. `null`: veri yok (kart boş durumunu çizer). */
  stats: MatchStatsData | null | undefined;
  lineups: MatchLineupData | null | undefined;
};

async function withinBudget<T>(fn: () => Promise<T>, budgetMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), budgetMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } catch {
    return undefined;
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
    withinBudget(() => getMatchStats(matchId), budgetMs),
    withinBudget(() => getMatchLineups(matchId), budgetMs),
  ]);
  return { stats, lineups };
}
