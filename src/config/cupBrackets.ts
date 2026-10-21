/**
 * Eleme ağacı gösterilen kupalar ve tur şablonları (2026-10-21, gerçek `stages/seasons/{id}` yanıtlarıyla doğrulandı).
 *
 * Sportmonks kurası çekilmemiş turları HİÇ döndürmüyor → ağacın eksik turları şablondan "Kura bekleniyor" kutusu olarak
 * çizilir. `optional` yuva yalnız yanıtta varsa (ya da `ifLeagueStage` ve sezonda "League Stage" varsa) ağaca girer:
 * UEFA'nın 2024/25 öncesi grup formatında eleme play-off'u yok; Türkiye Kupası'nda son 16 bazı sezonlarda var.
 *
 * - Şampiyonlar Ligi (2), Avrupa Ligi (5), Konferans Ligi (2286): ön eleme (type 225) → Lig Aşaması (223) →
 *   Knockout Round Play-offs (8 eşleşme) → 8th Finals (8) → Çeyrek (4) → Yarı (2) → Final (1, tek maç). İki ayak +
 *   `aggregates`.
 * - Türkiye Kupası (606): 1.–4. tur (byeler yüzünden ikili ağaç değil; liste olarak) → Grup Aşaması (223, 3 grup) →
 *   Çeyrek (4) → Yarı (2) → Final, hepsi tek maç (`leg` "1/1", kazanan `participants[].meta.winner`).
 * UEFA Süper Kupa (1328) tek maç — ağaç yok.
 */
import type { BracketSlot } from '@/services/cupBracket/types';

export type BracketSlotTemplate = { slot: BracketSlot; ties: number; optional?: 'ifPresent' | 'ifLeagueStage' };

const UEFA_CLUB: readonly BracketSlotTemplate[] = [
  { slot: 'ko_po', ties: 8, optional: 'ifLeagueStage' },
  { slot: 'r16', ties: 8 },
  { slot: 'qf', ties: 4 },
  { slot: 'sf', ties: 2 },
  { slot: 'final', ties: 1 },
];

const TURKISH_CUP: readonly BracketSlotTemplate[] = [
  { slot: 'r16', ties: 8, optional: 'ifPresent' },
  { slot: 'qf', ties: 4 },
  { slot: 'sf', ties: 2 },
  { slot: 'final', ties: 1 },
];

export const CUP_BRACKET_TEMPLATES: Readonly<Record<number, readonly BracketSlotTemplate[]>> = {
  2: UEFA_CLUB,
  5: UEFA_CLUB,
  2286: UEFA_CLUB,
  606: TURKISH_CUP,
};

export function hasCupBracket(leagueId: number | null | undefined): leagueId is number {
  return leagueId != null && Object.prototype.hasOwnProperty.call(CUP_BRACKET_TEMPLATES, leagueId);
}

/** Sportmonks aşama adı → ağaç yuvası (adlar sezona göre değişiyor: "8th Finals" / "Round of 16"). */
export function slotOfStageName(name: string): BracketSlot | null {
  const n = name.trim().toLowerCase();
  if (/^finals?$/.test(n)) return 'final';
  if (/semi/.test(n)) return 'sf';
  if (/quarter/.test(n)) return 'qf';
  if (/8th final|round of 16|last 16|1\/8/.test(n)) return 'r16';
  if (/knockout.*play/.test(n)) return 'ko_po';
  return null;
}
