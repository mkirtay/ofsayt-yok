/**
 * Milli maç (API-Football) bayrağı — `NATIONAL_MATCHES_ENABLED` (sunucu env; varsayılan KAPALI).
 * 1 / true / on → açık. Kapalıyken 2e9 üstü maç id'leri "bulunamadı" döner; hiçbir yerde görünmez.
 * Lig maçları (Sportmonks) bu bayraktan etkilenmez.
 */
export function parseNationalFlag(raw: string | undefined | null): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function nationalMatchesEnabled(): boolean {
  return parseNationalFlag(process.env.NATIONAL_MATCHES_ENABLED);
}
