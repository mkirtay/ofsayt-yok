/**
 * Milli takım (API-Football) turnuvaları: listeye alınanlar, Türkçe adlar ve liste sırası. Kimlikler AF'nin ham lig id'leridir
 * (2026-11-10'da `leagues?id=` ile doğrulandı); uygulamada bunlar `toAppId` ile 2e9 kaydırılmış görünür (bkz. services/apiFootball/ids.ts).
 * Yalnız erkek A milli takım turnuvaları; genç / kadın / kulüp turnuvaları bilerek yok.
 */
export type NationalLeague = { id: number; name: string; en: string; priority: number };

const L = (id: number, name: string, en: string, priority: number): NationalLeague => ({ id, name, en, priority });

export const NATIONAL_LEAGUES: readonly NationalLeague[] = [
  L(1, 'Dünya Kupası', 'World Cup', 0),
  L(4, 'Avrupa Şampiyonası', 'European Championship', 1),
  L(9, 'Copa América', 'Copa America', 2),
  L(6, 'Afrika Uluslar Kupası', 'Africa Cup of Nations', 3),
  L(7, 'Asya Kupası', 'Asian Cup', 4),
  L(22, 'CONCACAF Altın Kupa', 'CONCACAF Gold Cup', 5),
  L(21, 'Konfederasyonlar Kupası', 'Confederations Cup', 6),
  L(806, 'OFC Uluslar Kupası', 'OFC Nations Cup', 7),
  L(5, 'UEFA Uluslar Ligi', 'UEFA Nations League', 10),
  L(536, 'CONCACAF Uluslar Ligi', 'CONCACAF Nations League', 11),
  L(32, 'Dünya Kupası Elemeleri - Avrupa', 'World Cup Qualification - Europe', 20),
  L(34, 'Dünya Kupası Elemeleri - Güney Amerika', 'World Cup Qualification - South America', 21),
  L(29, 'Dünya Kupası Elemeleri - Afrika', 'World Cup Qualification - Africa', 22),
  L(30, 'Dünya Kupası Elemeleri - Asya', 'World Cup Qualification - Asia', 23),
  L(31, 'Dünya Kupası Elemeleri - CONCACAF', 'World Cup Qualification - CONCACAF', 24),
  L(33, 'Dünya Kupası Elemeleri - Okyanusya', 'World Cup Qualification - Oceania', 25),
  L(37, 'Dünya Kupası Elemeleri - Play-off', 'World Cup Qualification - Play-offs', 26),
  L(960, 'Avrupa Şampiyonası Elemeleri', 'Euro Qualification', 30),
  L(36, 'Afrika Uluslar Kupası Elemeleri', 'AFCON Qualification', 31),
  L(35, 'Asya Kupası Elemeleri', 'Asian Cup Qualification', 32),
  L(858, 'Altın Kupa Elemeleri', 'Gold Cup Qualification', 33),
  L(808, 'CONCACAF Uluslar Ligi Elemeleri', 'CONCACAF Nations League Qualification', 34),
  L(10, 'Hazırlık Maçları', 'Friendlies', 50),
];

const BY_ID = new Map(NATIONAL_LEAGUES.map((l) => [l.id, l]));

/** AF lig id'leri (ham). */
export const NATIONAL_LEAGUE_IDS: readonly number[] = NATIONAL_LEAGUES.map((l) => l.id);

export function nationalLeagueByAfId(afId: number): NationalLeague | undefined {
  return BY_ID.get(afId);
}

/** Listeye alınacak turnuva mı? */
export function isTrackedNationalLeague(afId: number): boolean {
  return BY_ID.has(afId);
}

/**
 * Hazırlık (ve diğer) listelerinde genç / kadın / olimpiyat takımları da gelir ("Brazil U20", "Japan W", "Spain Olympic"):
 * yalnız erkek A milli takımlar listelenir.
 */
export function isSeniorMenTeamName(name: string): boolean {
  return !/\s(U-?\d{2}|W|Women|Olympic|Olympics|B)$/i.test(name.trim()) && !/\bU-?\d{2}\b/i.test(name);
}
