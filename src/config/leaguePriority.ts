/**
 * Ana sayfa maç listesi — lig grubu ÖNCELİK sırası (Sportmonks `league_id` uzayı).
 *
 *  1) Süper Lig (600) — her zaman en üstte
 *  2) 5 büyük lig, bu sırayla: Premier League (8), La Liga (564), Bundesliga (82), Serie A (384), Ligue 1 (301)
 *  3) Diğer ülkelerin 1. ligleri (top-flight) — UEFA kulüp turnuvaları ve kupalar da burada (aşağıya bak)
 *  4) 2. ligler / alt kademe (Türkiye 1. Lig ve 2. Lig Beyaz/Kırmızı dahil)
 *
 * NEDEN STATİK LİSTE: Sportmonks yanıtında 1./2. kademeyi ayıran GÜVENİLİR bir alan YOK.
 * 2026-09-19'da gerçek `/leagues` ve `/fixtures/date` yanıtlarında doğrulandı:
 *  - `league.category` bir "lig gücü" sınıfı, kademe DEĞİL: Süper Lig = 2, 1. Lig = 2, Championship = 2,
 *    2. Bundesliga = 2, Ligue 2 = 2, Serie B = 2, La Liga 2 = 2, Allsvenskan = 2, Ukrayna Premier = 2;
 *    Bundesliga/Premier/La Liga = 1; yalnızca Türkiye 2. Lig = 4. Yani 2 hem 1. hem 2. kademeyi kapsıyor.
 *  - `sub_type` hepsi "domestic" (kupalar "domestic_cup"), `type` hepsi "league".
 *  - `short_code` tutarsız (null'lar var; "GER BII"/"ITA SB"/"UK CHAMP"/"TUR L1" farklı kalıplar).
 * Bu hesabın planında erişilebilen lig kümesi kapalı ve küçük (34 lig, `/leagues` ile sayıldı), bu yüzden
 * her lig için kademe elle ve gerçek veriye bakılarak işlendi. Plan genişlerse yeni lig burada işlenmeli;
 * işlenmemiş bilinmeyen lig "1. lig" (grup 3) sayılır — alt kademeyi yanlışlıkla üste değil, en fazla
 * 3. gruba koymak için; ve test bu tabloyu gerçek veri kümesiyle karşılaştırır.
 *
 * UEFA (CL/EL/ECL/Süper Kupa) ve ulusal kupalar (Türkiye Kupası, Copa del Rey) istenen 4 grubun dışında
 * kalıyordu; alt kademe DEĞİL oldukları için grup 3'te, grubun başında (UEFA sabit sırayla) gösterilir.
 */

export const SUPER_LIG_ID = 600;
/** Premier League, La Liga, Bundesliga, Serie A, Ligue 1 — SIRA ÖNEMLİ. */
export const BIG_FIVE_IDS = [8, 564, 82, 384, 301] as const;
/** UEFA CL, EL, ECL, Süper Kupa — grup 3'ün başında bu sırayla. */
export const UEFA_CLUB_IDS = [2, 5, 2286, 1328] as const;

/** Doğrulanmış alt kademe ligler (2026-09-19, `/leagues` + `/fixtures/date`): Championship, Ligue 2, 2. Bundesliga, Serie B, La Liga 2, TFF 1. Lig, 2. Lig Beyaz, 2. Lig Kırmızı. */
export const SECOND_TIER_LEAGUE_IDS: ReadonlySet<number> = new Set([9, 304, 85, 387, 567, 603, 1282, 1283]);

export type LeaguePriorityGroup = 1 | 2 | 3 | 4;

export function leaguePriorityGroup(sportmonksLeagueId: number | null | undefined): LeaguePriorityGroup {
  if (sportmonksLeagueId === SUPER_LIG_ID) return 1;
  if (sportmonksLeagueId != null && (BIG_FIVE_IDS as readonly number[]).includes(sportmonksLeagueId)) return 2;
  if (sportmonksLeagueId != null && SECOND_TIER_LEAGUE_IDS.has(sportmonksLeagueId)) return 4;
  return 3;
}

export type LeaguePriorityInput = {
  /** Sportmonks league_id (çağıran, gerekirse legacy id'yi çevirir). */
  leagueId: number | null;
  competition_name?: string;
  country_name?: string;
};

function isTurkey(g: LeaguePriorityInput): boolean {
  const n = (g.country_name || '').toLowerCase();
  return n === 'turkey' || n === 'türkiye' || n === 'turkiye';
}

/**
 * Grup içi sıra: 2 → büyük 5 sırası; 3 → UEFA sabit sıra, sonra Türkiye'nin kupası, sonra ülke/ad;
 * 4 → Türkiye önce, sonra ülke/ad. (Mevcut ülke→ad sıralaması korunuyor; yalnızca GRUP sırası değişti.)
 */
export function compareLeaguePriority(a: LeaguePriorityInput, b: LeaguePriorityInput): number {
  const ga = leaguePriorityGroup(a.leagueId);
  const gb = leaguePriorityGroup(b.leagueId);
  if (ga !== gb) return ga - gb;

  if (ga === 2) {
    return (BIG_FIVE_IDS as readonly number[]).indexOf(a.leagueId!) - (BIG_FIVE_IDS as readonly number[]).indexOf(b.leagueId!);
  }
  if (ga === 3) {
    const ua = (UEFA_CLUB_IDS as readonly number[]).indexOf(a.leagueId ?? -1);
    const ub = (UEFA_CLUB_IDS as readonly number[]).indexOf(b.leagueId ?? -1);
    if (ua >= 0 || ub >= 0) {
      if (ua < 0) return 1;
      if (ub < 0) return -1;
      return ua - ub;
    }
  }
  if (ga === 3 || ga === 4) {
    if (isTurkey(a) !== isTurkey(b)) return isTurkey(a) ? -1 : 1;
    const byCountry = (a.country_name || '').localeCompare(b.country_name || '', 'tr');
    if (byCountry !== 0) return byCountry;
    return (a.competition_name || '').localeCompare(b.competition_name || '', 'tr');
  }
  return 0;
}
