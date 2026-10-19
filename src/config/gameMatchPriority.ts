/**
 * Tahmin oyunu maç önceliği — haftalık admin önerisi (ilk 10 = otomatik öneri) ve "Günün 3 maçı" seçimi için TEK kaynak.
 * Kullanıcı kararı 2026-10-19. Takım id'leri Sportmonks. Lig id'leri config/leaguePriority.ts ile aynı uzay (oradan alınır).
 *
 * Sıra (üstteki önce):
 *  1. Türkiye'nin büyükleri (Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor): o hafta / gün oynadıkları HER maç (Süper Lig + Avrupa)
 *     — çeşitlilik sınırlarına takılmaz, her zaman girer.
 *  2. Avrupa kupalarında oynayan diğer Türk takımları (Türk takımı = o haftanın Türkiye ligi fikstürlerinde oynayan takım).
 *  3. Avrupa devlerinin maçları: iki dev karşılaşıyorsa en üstte; çekirdek devler ek listeden önce.
 *  4. Süper Lig'in kalan maçları ve beş büyük lig.
 *  5. Diğerleri (yalnız liste dolmazsa).
 * Kademe içinde: dev sayısı ↓, lig önceliği (Süper Lig → UEFA → beş büyük), başlama saati ↑.
 * Çeşitlilik (1. kademe hariç): aynı ligden en çok `maxPerLeague`, aynı takımdan en çok `maxPerTeam` maç.
 */
import { BIG_FIVE_IDS, SUPER_LIG_ID, UEFA_CLUB_IDS } from '@/config/leaguePriority';
import { TURKEY_TIER_LEAGUE_IDS, TURKISH_CUP_LEAGUE_ID } from '@/config/turkeyTiers';

/** Türkiye'nin büyükleri: Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor. */
export const TURKEY_BIG_TEAM_IDS: ReadonlySet<number> = new Set([34, 88, 554, 688]);

/** Avrupa devleri (çekirdek): Real Madrid, Barcelona, Bayern, PSG, Liverpool, Arsenal, Man City, Inter, Milan, Juventus. */
export const EURO_GIANT_IDS: ReadonlySet<number> = new Set([3468, 83, 503, 591, 8, 19, 9, 2930, 113, 625]);

/** Gerekirse (çekirdekten sonra): Atlético, Dortmund, Chelsea, Man United. */
export const EURO_GIANT_EXTRA_IDS: ReadonlySet<number> = new Set([7980, 68, 18, 14]);

/** Türk takımı tespiti için Türkiye ligleri (Süper Lig, 1. Lig, 2. Lig'ler, Türkiye Kupası). */
export const TURKISH_LEAGUE_IDS: ReadonlySet<number> = new Set([...TURKEY_TIER_LEAGUE_IDS, TURKISH_CUP_LEAGUE_ID]);

export const UEFA_IDS: ReadonlySet<number> = new Set(UEFA_CLUB_IDS);

/** Lig önceliği (kademe içi eşitlik): Süper Lig, UEFA kupaları, beş büyük lig; diğerleri sonra. */
export const LEAGUE_ORDER: readonly number[] = [SUPER_LIG_ID, ...UEFA_CLUB_IDS, ...BIG_FIVE_IDS];

/** 4. kademe ligleri: Süper Lig + beş büyük lig. */
export const TOP_LEAGUE_IDS: ReadonlySet<number> = new Set([SUPER_LIG_ID, ...BIG_FIVE_IDS]);

export type DiversityLimits = { maxPerLeague: number; maxPerTeam: number };

/** Haftalık 10 maç: aynı ligden en çok 5, aynı takımdan en çok 2. */
export const WEEKLY_LIMITS: DiversityLimits = { maxPerLeague: 5, maxPerTeam: 2 };

/** Günün 3 maçı: aynı ligden en çok 2 (takım günde zaten bir kez oynar). */
export const DAILY_LIMITS: DiversityLimits = { maxPerLeague: 2, maxPerTeam: 1 };
