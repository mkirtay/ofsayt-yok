/**
 * Isı haritası ölçeği — modelin 15 hücrelik zoneGrid'ini (bölge*5 + kolon) çizilecek 0–1 yoğunluğa çevirir.
 *
 * Değerler mutlak okunmaz: gpt-6-luna (prompt v5) grid'i pay dağılımı gibi dolduruyor (Liverpool–City
 * 2026-10-11: 7–19), gpt-4.1 ise 20–80 veriyordu; mutlak skalada Luna analizlerinde hiçbir hücre soluk
 * kremden öteye geçmiyordu. Bu yüzden iki takımın 30 değeri ORTAK min–max ile yayılır: maçın en yoğun
 * bölgesi 1, en zayıfı 0 olur, takımlar arası fark (hangisi baskın) korunur.
 */

export const ZONE_CELLS = 15; // 3 bölge x 5 kolon

/** En yüksek ile en düşük arasındaki fark bundan küçükse grid "düz" sayılır — yapay kırmızı üretilmez. */
export const FLAT_SPREAD = 5;
/** Düz grid'de her geçerli hücrenin yoğunluğu (orta ton). */
export const FLAT_LEVEL = 0.5;

/** Hücre yoğunluğu: 0–1; `null` = veri yok, çizilmez. */
export type HeatCell = number | null;

/** İlk 15 değeri okur; sayı olmayan ya da eksik hücre `null`, geçerliler 0–100'e kırpılır. */
export function sanitizeGrid(grid: unknown): HeatCell[] {
  const arr: unknown[] = Array.isArray(grid) ? grid : [];
  return Array.from({ length: ZONE_CELLS }, (_, i) => {
    const raw = arr[i];
    if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  });
}

/** İki takımın grid'ini ortak min–max ile 0–1'e yayar (bkz. dosya başı). */
export function normalizeHeat(homeGrid: unknown, awayGrid: unknown): { home: HeatCell[]; away: HeatCell[] } {
  const home = sanitizeGrid(homeGrid);
  const away = sanitizeGrid(awayGrid);
  const values = [...home, ...away].filter((v): v is number => v !== null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  let scale: (v: number) => number;
  if (values.length === 0 || hi <= 0) scale = () => 0;
  else if (hi - lo < FLAT_SPREAD) scale = () => FLAT_LEVEL;
  else scale = (v) => (v - lo) / (hi - lo);

  const apply = (grid: HeatCell[]) => grid.map((v) => (v === null ? null : scale(v)));
  return { home: apply(home), away: apply(away) };
}
