import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Değişen hücrenin vurgu süresi (CSS animasyonuyla aynı). */
export const CELL_FLASH_MS = 1600;
const REORDER_MS = 450;

/**
 * Canlı güncellemede değişen hücreyi ~1,6 sn vurgular. Hücreler `data-flash="anahtar"` + `data-flash-value` taşır; her
 * çizimden sonra değer bir öncekinden farklıysa sınıf eklenir, süre bitince kaldırılır. İlk çizimde (önceki değer yok)
 * ve `enabled` kapalıyken vurgu yok. Sınıf DOM'da: ebeveyn arada yeniden çizse de (ticker vb.) yarıda kesilmez — bu yüzden
 * vurgulanan öğenin kendi `className`'i değişmeyen bir iç `span` olmalı.
 */
export function useCellFlash(root: RefObject<HTMLElement | null>, enabled: boolean, flashClass: string | undefined): void {
  const prev = useRef<Map<string, string> | null>(null);
  const timers = useRef(new Map<Element, number>());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const next = new Map<string, string>();
    const cells = Array.from(el.querySelectorAll<HTMLElement>('[data-flash]'));
    for (const c of cells) next.set(c.dataset.flash!, c.dataset.flashValue ?? '');
    const before = prev.current;
    prev.current = next;
    if (!before || !enabled || !flashClass) return;
    for (const c of cells) {
      const key = c.dataset.flash!;
      if (!before.has(key) || before.get(key) === next.get(key)) continue;
      c.classList.remove(flashClass);
      void c.offsetWidth; // animasyonu baştan başlat
      c.classList.add(flashClass);
      window.clearTimeout(timers.current.get(c));
      timers.current.set(c, window.setTimeout(() => c.classList.remove(flashClass), CELL_FLASH_MS));
    }
  });
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((id) => window.clearTimeout(id));
  }, []);
}

/**
 * Sıra değişince satırlar eski yerinden yenisine kısa bir kaydırmayla geçer (FLIP): kullanıcı takımını izleyebilir.
 * Yalnız yeri değişen satırlar oynar; aynı takım kümesi değilse (sezon / lig değişti) ya da hareket azaltma tercihinde
 * animasyon yok. `tr[data-team]` satırları okunur.
 */
export function useRowReorderAnimation(tbody: RefObject<HTMLTableSectionElement | null>): void {
  const prev = useRef<Map<string, { index: number; top: number }> | null>(null);
  useLayoutEffect(() => {
    const el = tbody.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLTableRowElement>('tr[data-team]'));
    const next = new Map<string, { index: number; top: number }>();
    rows.forEach((r, index) => next.set(r.dataset.team!, { index, top: r.offsetTop }));
    const before = prev.current;
    prev.current = next;
    if (!before || before.size !== next.size || [...next.keys()].some((k) => !before.has(k))) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const r of rows) {
      const a = before.get(r.dataset.team!)!;
      const b = next.get(r.dataset.team!)!;
      const dy = a.top - b.top;
      if (a.index === b.index || dy === 0 || typeof r.animate !== 'function') continue;
      r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
        duration: REORDER_MS,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      });
    }
  });
}

/** `active` iken `ms` aralıkla yenilenen "şimdi" (canlı verinin güncelliğini değerlendirmek için). */
export function useNow(active: boolean, ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}
