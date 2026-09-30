/**
 * Skor metni → [ev, deplasman]. Sportmonks eşlemesi "1-0" (boşluksuz) üretir (`scoreDerivation.ts`),
 * eski sağlayıcı ve bazı ekranlar "1 - 0" kullanır — ikisi de okunur. Skor yoksa/okunamazsa `null`.
 */
export function parseScore(raw: string | null | undefined): [number, number] | null {
  if (!raw) return null;
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(raw);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
