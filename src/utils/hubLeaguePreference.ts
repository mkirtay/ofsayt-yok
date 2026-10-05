/**
 * Ana sayfa yan panelinde seçili ligin hatırlanması (localStorage). Değer: hub seçim id'si (bkz. hubLeagueSelection.ts)
 * + o ligin son görülen puan tablosu satır sayısı (geri yüklemede iskelet doğru yükseklikte → tablo gelince kayma yok).
 * Bozuk / bilinmeyen / izin verilmeyen değer yok sayılır. Depolama kapalıysa sessizce varsayılan.
 */
export const HUB_LEAGUE_STORAGE_KEY = 'oy_hub_league';

export type StoredHubLeague = { id: number; rows: number | null };

export function parseStoredHubLeague(raw: string | null, isAllowed: (id: number) => boolean): StoredHubLeague | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  // Eski / elle yazılmış düz sayı da kabul
  const obj = typeof v === 'number' ? { id: v } : v;
  if (!obj || typeof obj !== 'object') return null;
  const id = (obj as { id?: unknown }).id;
  const rows = (obj as { rows?: unknown }).rows;
  if (typeof id !== 'number' || !Number.isInteger(id) || id === 0 || !isAllowed(id)) return null;
  return { id, rows: typeof rows === 'number' && Number.isInteger(rows) && rows > 0 && rows <= 64 ? rows : null };
}

export function readStoredHubLeague(isAllowed: (id: number) => boolean): StoredHubLeague | null {
  try {
    return parseStoredHubLeague(window.localStorage.getItem(HUB_LEAGUE_STORAGE_KEY), isAllowed);
  } catch {
    return null;
  }
}

export function storeHubLeague(value: StoredHubLeague): void {
  try {
    window.localStorage.setItem(HUB_LEAGUE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // depolama kapalı / dolu: tercih bu oturumla sınırlı kalır
  }
}
