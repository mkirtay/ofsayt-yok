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

/**
 * Milli maçlarda AI analizi — `NATIONAL_ANALYSIS_ENABLED` (varsayılan KAPALI) + milli maç bayrağı birlikte açık olmalı.
 * Kapalıyken `buildMatchAnalysisContext` milli id'leri eskisi gibi "bulunamadı" sayar.
 */
export function nationalAnalysisEnabled(): boolean {
  return nationalMatchesEnabled() && parseNationalFlag(process.env.NATIONAL_ANALYSIS_ENABLED ?? process.env.NEXT_PUBLIC_NATIONAL_ANALYSIS_ENABLED);
}

/**
 * İstemci tarafı: milli maçta AI Analiz sekmesi görünsün mü. `NEXT_PUBLIC_` değişkeni derlemede gömülür; sunucu bayrağı
 * (`NATIONAL_ANALYSIS_ENABLED`) ile AYNI değere ayarlanmalı (ikisi de Production'da açılmadan sekme görünmez).
 */
export function nationalAnalysisTabVisible(): boolean {
  return parseNationalFlag(process.env.NEXT_PUBLIC_NATIONAL_ANALYSIS_ENABLED);
}
