import type { Match } from '@/models/liveScore';
import { getTeamsHead2Head, type Head2HeadData } from '@/services/liveScoreService';
import { h2hTeamKey } from '@/utils/matchForm';

/** Maç kartı formu + karşılaşma geçmişi için SSR bütçesi: aşılırsa sayfa beklemez, istemci çeker. */
export const MATCH_CARD_H2H_BUDGET_MS = 400;

/**
 * Maç kartının "Son 5 maç / Karşılıklı son 5 / Karşılaşma geçmişi" verisi SSR'da (kart sonradan uzamasın, CLS).
 * Aynı `getTeamsHead2Head` → aynı sunucu cache katmanı (proxy ile ortak): ek Sportmonks isteği yok.
 * - `Head2HeadData`: veri var · `null`: veri yok (kart bu bölümleri hiç çizmez) · `undefined`: bütçe aşıldı / hata →
 *   istemci çeker (yer iskeletle ayrılır). Bütçe aşılsa da istek arka planda sürer ve cache'i ısıtır.
 */
export async function loadMatchCardH2h(
  match: Match,
  budgetMs = MATCH_CARD_H2H_BUDGET_MS,
): Promise<Head2HeadData | null | undefined> {
  const key = h2hTeamKey(match);
  if (!key) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), budgetMs);
  });
  try {
    return await Promise.race([getTeamsHead2Head(key.team1Id, key.team2Id), timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
