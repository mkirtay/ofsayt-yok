/**
 * Sportmonks `referees[]` dizisini mevcut `Match.referee: string` alanına
 * ve zenginleştirilmiş bir varyanta çevirir.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 3 "referee" bölümü + Pass 5
 * Soru 4. `type_id` sözlüğü doküman + 2 bağımsız gerçek fikstürle (Türkiye
 * Kupası maçı, Şampiyonlar Ligi finali) çapraz doğrulandı: 6=orta hakem,
 * 7=1. yardımcı, 8=2. yardımcı, 9=4. hakem, 10=VAR (her maçta garanti değil).
 */
import type { SportmonksRefereeRow } from './types';

export const REFEREE_TYPE_IDS = {
  MAIN: 6,
  FIRST_ASSISTANT: 7,
  SECOND_ASSISTANT: 8,
  FOURTH_OFFICIAL: 9,
  VAR: 10,
} as const;

export const REFEREE_ROLE_NAMES: Record<number, string> = {
  [REFEREE_TYPE_IDS.MAIN]: 'Referee',
  [REFEREE_TYPE_IDS.FIRST_ASSISTANT]: '1st Assistant',
  [REFEREE_TYPE_IDS.SECOND_ASSISTANT]: '2nd Assistant',
  [REFEREE_TYPE_IDS.FOURTH_OFFICIAL]: '4th Official',
  [REFEREE_TYPE_IDS.VAR]: 'VAR',
};

/**
 * Mevcut tek-string `Match.referee` alanı için: `type_id===6` (orta hakem)
 * olan kaydı bulup `referee.display_name` (yoksa `.name`) döner.
 */
export function formatMainReferee(referees: SportmonksRefereeRow[] | undefined | null): string | null {
  if (!referees || referees.length === 0) return null;
  const main = referees.find((r) => r.type_id === REFEREE_TYPE_IDS.MAIN);
  if (!main?.referee) return null;
  return main.referee.display_name ?? main.referee.name ?? null;
}

export type EnrichedReferee = {
  refereeId: number;
  typeId: number;
  role: string;
  name: string | null;
};

/**
 * Ham `referees[]`'i, gelecekte UI'ın (ör. hakem ekibi listesi) kullanmak
 * isteyebileceği, rol adıyla etiketlenmiş bir diziye çevirir. `role`
 * bilinmeyen bir `type_id` için `"Unknown"` döner.
 */
export function enrichReferees(referees: SportmonksRefereeRow[] | undefined | null): EnrichedReferee[] {
  if (!referees) return [];
  return referees.map((r) => ({
    refereeId: r.referee_id,
    typeId: r.type_id,
    role: REFEREE_ROLE_NAMES[r.type_id] ?? 'Unknown',
    name: r.referee?.display_name ?? r.referee?.name ?? null,
  }));
}
