/**
 * Türkiye kupası maçlarında takımın adının yanında gösterilen KADEME etiketi.
 *
 * Kaynak: planımızdaki Türkiye ligleri (Sportmonks `league_id`). Grup ayrımı (Beyaz/Kırmızı) etikete taşınmaz —
 * liste ve kartta yalnızca kısa kademe ("2. Lig"); grup dahil tam ad yalnızca maç detay başlığındadır (`leagueNameById` 'full').
 * Planda olmayan (3. Lig, BAL, amatör) takım → etiket YOK (yanlış bilgi yerine eksik bilgi).
 */
export const TURKISH_CUP_LEAGUE_ID = 606;

export type TurkeyTierKey = 'superLig' | 'firstLeague' | 'secondLeague';

/** Sportmonks league_id → kademe anahtarı (`leagues` i18n: `tier.<key>`). */
export const TURKEY_TIER_BY_LEAGUE_ID: Readonly<Record<number, TurkeyTierKey>> = {
  600: 'superLig',
  603: 'firstLeague',
  1282: 'secondLeague',
  1283: 'secondLeague',
};

export const TURKEY_TIER_LEAGUE_IDS: readonly number[] = Object.keys(TURKEY_TIER_BY_LEAGUE_ID).map(Number);

/** `GET /api/leagues/turkey-team-tiers` gövdesi. */
export type TurkeyTeamTiersPayload = {
  /** takım id → Sportmonks league_id (yalnızca planımızdaki Türkiye ligleri) */
  tiers: Record<string, number>;
  /** Haritanın geçerli olduğu ilk tarih (YYYY-MM-DD, güncel sezonun Temmuz başı): eski sezon kupa maçlarında etiket gösterilmez. */
  validFrom?: string;
};
