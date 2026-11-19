/**
 * Arka plan scroll kilidi (mobil menü / diyalog açıkken): YALNIZ `html` üzerinde `overflow:hidden` (+ overscroll yok).
 *
 * - `position:fixed` yöntemi BİLİNÇLİ kullanılmadı: gövde sabitlenince sticky header (ve menüyü kapatan X butonu) sayfa
 *   kaydırılmışsa ekran dışına kayıyor.
 * - `body`'ye DOKUNULMAZ (2026-11-20 hatası): html ve body ikisi birden `overflow:hidden` olunca html'in değeri viewport'a
 *   geçer, body'ninki body'nin kendisine kalır → body ayrı bir kaydırma kutusu olur; sticky header artık viewport'a değil
 *   body'ye yapışır ve sayfa kaydırılmışsa menü açılınca yukarıda kalır (aradaki boşlukta içerik görünür). Yalnız html
 *   kilitlenince değer viewport'a geçer, body kutu olmaz, header yerinde kalır.
 * - `overflow:hidden` scroll konumunu korur; kilit kalkınca önceki inline değerler birebir geri yazılır.
 * - `doc` parametreli → node ortamında sahte nesnelerle test edilebilir.
 */
type StyleBag = Record<string, string>;
type DocLike = { documentElement: { style: StyleBag } };

export function lockBodyScroll(doc: DocLike = document as unknown as DocLike): () => void {
  const s = doc.documentElement.style;
  const saved = { overflow: s.overflow ?? '', overscrollBehavior: s.overscrollBehavior ?? '' };
  s.overflow = 'hidden';
  s.overscrollBehavior = 'none';

  let released = false;
  return () => {
    if (released) return; // çift çağrıya karşı güvenli
    released = true;
    s.overflow = saved.overflow;
    s.overscrollBehavior = saved.overscrollBehavior;
  };
}
