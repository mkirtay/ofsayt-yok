/**
 * Arka plan scroll kilidi (mobil menü açıkken): `html` + `body` üzerinde `overflow:hidden`.
 * `position:fixed` yöntemi BİLİNÇLİ kullanılmadı: gövde sabitlenince sticky header
 * (ve menüyü kapatan X butonu) sayfa kaydırılmışsa ekran dışına kayıyor. `overflow:hidden`
 * scroll konumunu zaten korur; kilit kalkınca önceki inline değerler birebir geri yazılır.
 * `doc` parametreli → node ortamında sahte nesnelerle test edilebilir.
 */
type StyleBag = Record<string, string>;
type DocLike = { body: { style: StyleBag }; documentElement: { style: StyleBag } };

export function lockBodyScroll(doc: DocLike = document as unknown as DocLike): () => void {
  const targets = [doc.body.style, doc.documentElement.style];
  const saved = targets.map((s) => ({ overflow: s.overflow ?? '', overscrollBehavior: s.overscrollBehavior ?? '' }));

  for (const s of targets) {
    s.overflow = 'hidden';
    s.overscrollBehavior = 'none';
  }

  let released = false;
  return () => {
    if (released) return; // çift çağrıya karşı güvenli
    released = true;
    targets.forEach((s, i) => {
      s.overflow = saved[i]!.overflow;
      s.overscrollBehavior = saved[i]!.overscrollBehavior;
    });
  };
}
