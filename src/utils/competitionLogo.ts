const UEFA_TIER2_COMPETITION_IDS = new Set([245, 244, 446]);

export function isUefaTier2CompetitionId(competitionId?: number | null): boolean {
  if (competitionId == null) return false;
  return UEFA_TIER2_COMPETITION_IDS.has(competitionId);
}

export function uefaCompetitionLogoSrcById(
  competitionId?: number | null,
): string | null {
  return isUefaTier2CompetitionId(competitionId)
    ? '/images/uefa-logo.svg'
    : null;
}

/**
 * Koyu temada zeminle birleşen lig logoları (Sportmonks league id) → `logo-backdrop` mixin'iyle açık bir zemin alırlar.
 *
 * 2026-10-02'de planın 34 lig logosu ölçüldü: opak piksellerin koyu yüzeye (#1a1c24) WCAG kontrastı + 14/24 px'te
 * gözle kontrol. Listede: 2 UCL, 5 UEL, 2286 UECL (siyah/koyu gri), 8 Premier League (koyu mor, medyan 1,00),
 * 9 Championship (koyu lacivert, 1,96), 72 Eredivisie (koyu mavi, 1,31), 208 Belçika Pro League (koyu lacivert kutu,
 * 1,16), 271 Danimarka Superliga (siyah, 1,04), 501 İskoçya Premiership (lacivert, 1,24), 570 Copa del Rey (koyu
 * kırmızı-kahve, 2,75), 603 / 1282 / 1283 TFF 1. Lig ve 2. Lig (koyu kırmızı-lacivert, 3,2–3,7 ama küçük boyutta
 * kayboluyor), 1328 UEFA Süper Kupa (koyu gri-mavi).
 * Sınırda, eklenmedi: 600 Süper Lig (kırmızı kısmı net), 944 Suudi Pro League (renkli halka), 636 Arjantin (açık harfler).
 */
const DARK_ON_TRANSPARENT_LOGO_IDS = new Set([2, 5, 2286, 8, 9, 72, 208, 271, 501, 570, 603, 1282, 1283, 1328]);

export function competitionLogoNeedsBackdrop(competitionId?: number | null): boolean {
  return competitionId != null && DARK_ON_TRANSPARENT_LOGO_IDS.has(competitionId);
}
