/**
 * Hesap silme onayı — istemci (profil formu düğmeyi açar) ve sunucu (DELETE /api/user/me) aynı kuralı kullanır.
 * Saf; prisma / sunucu modülü içermez (tarayıcı paketine girer).
 */

/** Onay kelimesi (büyük harf). Türkçe klavyesi olmayanlar için noktasız "SIL" de kabul edilir. */
export const DELETE_CONFIRM_WORD = 'SİL';

/**
 * Açık onay: hesabın e-postası (büyük/küçük harf ve baş/son boşluk farkı yok) ya da "SİL" / "sil" / "SIL". Google ile
 * girenlerde de çalışır (şifre istenmez).
 */
export function isDeletionConfirmed(confirm: unknown, accountEmail: string): boolean {
  if (typeof confirm !== 'string' || confirm.length > 320) return false;
  const v = confirm.trim();
  if (!v) return false;
  const word = v.toLocaleUpperCase('tr-TR');
  if (word === DELETE_CONFIRM_WORD || v.toUpperCase() === 'SIL') return true;
  return !!accountEmail && v.toLowerCase() === accountEmail.trim().toLowerCase();
}
