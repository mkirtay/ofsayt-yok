/** Ana sayfanın (henüz DB'ye taşınmamış) favori takımlarını tuttuğu localStorage anahtarı. */
export const HOME_FAVORITES_LS_KEY = 'oy_fav_club_teams';
export const MAX_FAVORITES = 50;

/** localStorage ham değerinden geçerli (pozitif tamsayı, tekil) takım id'leri; bozuk veri → []. */
export function parseLocalFavoriteIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  } catch {
    return [];
  }
}

/** DB favorileri + cihaz favorileri birleşimi (mevcutlar önce, sıra korunur, üst sınır 50). `added` = gerçekten eklenen. */
export function mergeFavoriteIds(existing: number[], local: number[], max = MAX_FAVORITES): { merged: number[]; added: number[] } {
  const merged = [...existing];
  const added: number[] = [];
  for (const id of local) {
    if (merged.length >= max) break;
    if (!merged.includes(id)) {
      merged.push(id);
      added.push(id);
    }
  }
  return { merged, added };
}
