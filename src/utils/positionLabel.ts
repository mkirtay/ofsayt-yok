/** `position` kısaltması (Sportmonks `position_id` → typeDictionaries: 24 GK, 25 DF, 26 MF, 27 FW) → Türkçe mevki etiketi. */
export const POSITION_LABEL_TR: Record<string, string> = {
  GK: 'Kaleci',
  DF: 'Defans',
  MF: 'Orta Saha',
  FW: 'Forvet',
};

export function positionLabel(position: string | undefined | null): string | null {
  return position ? (POSITION_LABEL_TR[position] ?? null) : null;
}

/** Sportmonks `detailed_position_id` (typeDictionaries → core/types, 2026-09-19'da gerçek veriyle doğrulandı) → Türkçe mevki. */
export const DETAILED_POSITION_LABEL_TR: Record<number, string> = {
  24: 'Kaleci',
  148: 'Stoper',
  154: 'Sağ Bek',
  155: 'Sol Bek',
  149: 'Defansif Orta Saha',
  153: 'Merkez Orta Saha',
  150: 'Ofansif Orta Saha',
  157: 'Sol Orta Saha',
  158: 'Sağ Orta Saha',
  152: 'Sol Açık',
  156: 'Sağ Açık',
  151: 'Santrfor',
};

/** Ayrıntılı mevki id → FIFA tarzı kısa kod (İlk 11 rozeti). */
export const DETAILED_POSITION_CODE: Record<number, string> = {
  24: 'GK',
  148: 'CB',
  154: 'RB',
  155: 'LB',
  149: 'CDM',
  153: 'CM',
  150: 'CAM',
  157: 'LM',
  158: 'RM',
  152: 'LW',
  156: 'RW',
  151: 'ST',
};

export function detailedPositionCode(id: number | undefined | null, coarse?: string | null): string | null {
  return (id != null ? DETAILED_POSITION_CODE[id] : undefined) ?? coarse ?? null;
}

export function detailedPositionLabel(id: number | undefined | null): string | null {
  return id != null ? (DETAILED_POSITION_LABEL_TR[id] ?? null) : null;
}
