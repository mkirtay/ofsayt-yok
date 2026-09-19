/**
 * Pass 5'te `/core/types`'tan gerçek isteklerle çözülen üç statik sözlük.
 *
 * Runtime'da `/core/types`'a İSTEK ATILMIYOR — kota tasarrufu için sözlük
 * koda gömülü (Pass 5'in kendi önerisi: "Bu endpoint'in tamamı 27000+ type
 * içerebilir, dokümante edilmesi önerilir/cache'lenmelidir").
 *
 * `observed: true` — bu type_id gerçek bir maçta fiilen görüldü.
 * `observed: false` — `/types` sözlüğünde bulundu ama örnek maçlarda hiç
 * gözlemlenmedi (Pass 5: Own Goal, Missed Penalty, Redcard, 2.Sarı/Kırmızı).
 * Rapor talimatı gereği bunlar da atlanmadan dahil edildi.
 */

export type TypeDictionaryEntry = {
  id: number;
  name: string;
  observed: boolean;
};

// ── getMatchWithEvents — event type_id sözlüğü (13 kayıt, Pass 5 + Faz 3) ──
// Not: id 13 ("Sidelined") raporun event tablosunda listelendi ama
// `model_type:"lineup"` — gerçek bir maç olayı değil, bağlamsal bir işaret.
// Rapor talimatı ("BİREBİR kopyala, atlama") gereği yine de dahil edildi.
//
// Faz 3 EKİ (2026-09-18, kırmızı kart doğrulama turu): La Liga fixture
// 19732740 (Celta de Vigo vs Osasuna, Marcos Alonso kırmızı kart) `include=events`
// ile çekildiğinde Pass 5'in 11'lik listesinde OLMAYAN iki type_id daha gerçekten
// gözlemlendi — `GET /core/types/{id}` ile isimleri doğrulandı: 10="VAR",
// 1697="VAR_CARD" (VAR incelemesiyle verilen/değiştirilen kart). İkisi de dahil
// edildi, observed:true.
export const EVENT_TYPES: Record<number, TypeDictionaryEntry> = {
  14: { id: 14, name: 'Goal', observed: true },
  15: { id: 15, name: 'Own Goal', observed: false },
  16: { id: 16, name: 'Penalty', observed: true },
  17: { id: 17, name: 'Missed Penalty', observed: false },
  18: { id: 18, name: 'Substitution', observed: true },
  19: { id: 19, name: 'Yellowcard', observed: true },
  20: { id: 20, name: 'Redcard', observed: true }, // Faz 3: fixture 19732740, Marcos Alonso
  21: { id: 21, name: 'Yellow/Red card', observed: false },
  22: { id: 22, name: 'Penalty Shootout Miss', observed: true },
  23: { id: 23, name: 'Penalty Shootout Goal', observed: true },
  13: { id: 13, name: 'Sidelined', observed: false },
  10: { id: 10, name: 'VAR', observed: true }, // Faz 3, fixture 19732740
  1697: { id: 1697, name: 'VAR_CARD', observed: true }, // Faz 3, fixture 19732740
};

/**
 * `EVENT_TYPES[typeId].name`'i `EventTimeline`'ın beklediği kanonik
 * BÜYÜK_HARF_ALT_ÇİZGİ etikete çevirir. Dört değer (`GOAL`/`YELLOW_CARD`/
 * `RED_CARD`/`SUBSTITUTION`) mevcut `EVENT_ICONS` sözlüğüyle (EventTimeline/
 * index.tsx) birebir eşleşecek şekilde ELLE seçildi — `name`'i otomatik
 * büyütüp alt çizgiye çevirmek "Yellowcard"→"YELLOWCARD" (boşluksuz) verirdi,
 * `EVENT_ICONS`'un beklediği "YELLOW_CARD" değil. Bilinmeyen bir `type_id`
 * için `EVENT_${typeId}` döner (ikon sözlüğünde karşılığı olmayan güvenli
 * varsayılan, `EventTimeline` zaten bilinmeyen anahtarlar için 📋 gösteriyor).
 */
const EVENT_LABELS: Record<number, string> = {
  14: 'GOAL',
  15: 'OWN_GOAL',
  16: 'PENALTY',
  17: 'MISSED_PENALTY',
  18: 'SUBSTITUTION',
  19: 'YELLOW_CARD',
  20: 'RED_CARD',
  21: 'YELLOW_RED_CARD',
  22: 'PENALTY_SHOOTOUT_MISS',
  23: 'PENALTY_SHOOTOUT_GOAL',
  10: 'VAR',
  1697: 'VAR_CARD',
};

export function resolveEventLabel(typeId: number): string {
  return EVENT_LABELS[typeId] ?? `EVENT_${typeId}`;
}

// ── getMatchStats — statistics type_id sözlüğü (45 kayıt, Pass 5 + Faz 3) ──
// Faz 3 EKİ (2026-09-18, kırmızı kart doğrulama turu, fixture 19732740 Celta
// de Vigo vs Osasuna): Pass 5'in 43'lük listesinde OLMAYAN iki type_id daha
// gerçek `statistics[]` çıktısında görüldü — `type_id:83 "Redcards"` (Pass
// 5'in "hâlâ açık" bıraktığı `red_cards` alanının TAM KARŞILIĞI, aşağıdaki
// `UNRESOLVED_STATISTIC_FIELDS` artık boş) ve `type_id:27267 "Tackles Won"`.
export const STATISTIC_TYPES: Record<number, TypeDictionaryEntry & { statGroup: string }> = {
  34: { id: 34, name: 'Corners', statGroup: 'offensive', observed: true },
  41: { id: 41, name: 'Shots Off Target', statGroup: 'offensive', observed: true },
  42: { id: 42, name: 'Shots Total', statGroup: 'offensive', observed: true },
  43: { id: 43, name: 'Attacks', statGroup: 'offensive', observed: true },
  44: { id: 44, name: 'Dangerous Attacks', statGroup: 'offensive', observed: true },
  45: { id: 45, name: 'Ball Possession %', statGroup: 'overall', observed: true },
  46: { id: 46, name: 'Ball Safe', statGroup: 'defensive', observed: true },
  47: { id: 47, name: 'Penalties', statGroup: 'offensive', observed: true },
  49: { id: 49, name: 'Shots Insidebox', statGroup: 'offensive', observed: true },
  50: { id: 50, name: 'Shots Outsidebox', statGroup: 'offensive', observed: true },
  51: { id: 51, name: 'Offsides', statGroup: 'offensive', observed: true },
  52: { id: 52, name: 'Goals', statGroup: 'offensive', observed: true },
  53: { id: 53, name: 'Goal Kicks', statGroup: 'offensive', observed: true },
  54: { id: 54, name: 'Goal Attempts', statGroup: 'offensive', observed: true },
  55: { id: 55, name: 'Free Kicks', statGroup: 'defensive', observed: true },
  56: { id: 56, name: 'Fouls', statGroup: 'defensive', observed: true },
  57: { id: 57, name: 'Saves', statGroup: 'defensive', observed: true },
  58: { id: 58, name: 'Shots Blocked', statGroup: 'offensive', observed: true },
  59: { id: 59, name: 'Substitutions', statGroup: 'overall', observed: true },
  60: { id: 60, name: 'Throwins', statGroup: 'overall', observed: true },
  62: { id: 62, name: 'Long Passes', statGroup: 'overall', observed: true },
  64: { id: 64, name: 'Hit Woodwork', statGroup: 'offensive', observed: true },
  65: { id: 65, name: 'Successful Headers', statGroup: 'overall', observed: true },
  78: { id: 78, name: 'Tackles', statGroup: 'defensive', observed: true },
  79: { id: 79, name: 'Assists', statGroup: 'offensive', observed: true },
  80: { id: 80, name: 'Passes', statGroup: 'overall', observed: true },
  81: { id: 81, name: 'Successful Passes', statGroup: 'overall', observed: true },
  82: { id: 82, name: 'Successful Passes Percentage', statGroup: 'overall', observed: true },
  84: { id: 84, name: 'Yellowcards', statGroup: 'overall', observed: true },
  86: { id: 86, name: 'Shots On Target', statGroup: 'offensive', observed: true },
  87: { id: 87, name: 'Injuries', statGroup: 'overall', observed: true },
  98: { id: 98, name: 'Total Crosses', statGroup: 'offensive', observed: true },
  99: { id: 99, name: 'Accurate Crosses', statGroup: 'offensive', observed: true },
  100: { id: 100, name: 'Interceptions', statGroup: 'defensive', observed: true },
  106: { id: 106, name: 'Duels Won', statGroup: 'offensive', observed: true },
  108: { id: 108, name: 'Dribble Attempts', statGroup: 'offensive', observed: true },
  109: { id: 109, name: 'Successful Dribbles', statGroup: 'offensive', observed: true },
  117: { id: 117, name: 'Key Passes', statGroup: 'overall', observed: true },
  580: { id: 580, name: 'Big Chances Created', statGroup: 'offensive', observed: true },
  581: { id: 581, name: 'Big Chances Missed', statGroup: 'offensive', observed: true },
  1605: { id: 1605, name: 'Successful Dribbles Percentage', statGroup: 'offensive', observed: true },
  27264: { id: 27264, name: 'Successful Long Passes', statGroup: 'overall', observed: true },
  27265: { id: 27265, name: 'Successful Long Passes Percentage', statGroup: 'overall', observed: true },
  83: { id: 83, name: 'Redcards', statGroup: 'overall', observed: true }, // Faz 3: fixture 19732740
  27267: { id: 27267, name: 'Tackles Won', statGroup: 'defensive', observed: true }, // Faz 3: fixture 19732740
};

/**
 * Pass 5 `red_cards`'ı çözülmemiş bırakmıştı — Faz 3'te kırmızı kartlı gerçek
 * bir maçla (fixture 19732740, Marcos Alonso) doğrulandı: `type_id:83`. Liste
 * artık boş; tip biçimi ("hâlâ çözülmemiş alan var mı" kontrolü yapan kod
 * için) korunuyor.
 */
export const UNRESOLVED_STATISTIC_FIELDS: readonly string[] = [];

// ── getMatchLineups — lineup type_id (2) + position_id (4) sözlüğü ─────────
export const LINEUP_STATUS_TYPES: Record<number, TypeDictionaryEntry> = {
  11: { id: 11, name: 'Lineup', observed: true }, // ilk 11
  12: { id: 12, name: 'Bench', observed: true }, // yedek
  13: { id: 13, name: 'Sidelined', observed: false }, // komşu kod, lineup listesinde gözlemlenmedi
};

/** Mevcut `LineupPlayer.position: "GK"|"DF"|"MF"|"FW"` alanına birebir karşılık gelir. */
export const POSITION_TYPES: Record<number, TypeDictionaryEntry & { shortCode: 'GK' | 'DF' | 'MF' | 'FW' }> = {
  24: { id: 24, name: 'Goalkeeper', shortCode: 'GK', observed: true },
  25: { id: 25, name: 'Defender', shortCode: 'DF', observed: true },
  26: { id: 26, name: 'Midfielder', shortCode: 'MF', observed: true },
  27: { id: 27, name: 'Attacker', shortCode: 'FW', observed: true },
};

export function resolvePositionShortCode(positionId: number): 'GK' | 'DF' | 'MF' | 'FW' | null {
  return POSITION_TYPES[positionId]?.shortCode ?? null;
}
