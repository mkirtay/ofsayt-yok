/**
 * Meta açıklama uzunluk sınırı. Google mobilde ~120, masaüstünde ~155–160 karakterden sonrasını kesiyor; kesilen yerde
 * yarım cümle kalmasın diye önce cümle sonunda, olmazsa kelime sınırında kısaltılır (önemli bilgi başta yazılmalı).
 */
export const META_DESCRIPTION_MAX = 160;

export function clampDescription(text: string, max: number = META_DESCRIPTION_MAX): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  // Cümle sonu: ". " / "! " / "? " — sınırın içinde kalan son cümle, en az yarı uzunluktaysa yeterli.
  const head = s.slice(0, max + 1);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentenceEnd >= max * 0.5) return s.slice(0, sentenceEnd + 1);
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/** Türkiye UTC+3 sabit (2016'dan beri yaz saati yok): Europe/Istanbul yerel saatini ofsetli ISO 8601 olarak verir. */
export function istanbulIsoDateTime(ms: number): string {
  const d = new Date(ms + 3 * 3600_000);
  return `${d.toISOString().slice(0, 19)}+03:00`;
}
