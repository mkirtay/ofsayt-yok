/**
 * "Silinmiş kullanıcı" — hesabını silen kullanıcıların Gündem gönderileri / yorumları ve sipariş kayıtları bu TEK
 * yer tutucu User satırına devredilir (server/account/deleteAccount.ts). Böylece gönderiler kaybolmaz, yazar alanı
 * hiçbir istemcide null olmaz (mobil yazar nesnesi bekliyor) ve kişiyle bağlantı kopar (tüm silinenler aynı satır →
 * gönderiler kişi bazında da gruplanamaz).
 *
 * Satır ilk silmede `upsert` ile oluşturulur: şifre yok, OAuth hesabı yok → giriş yapılamaz. Profil uçları ve sayfası
 * bu kimlik için 404 döner. Bu satır ASLA silinmemeli: PaymentOrder kullanıcı silinince CASCADE ile silinir.
 */
export const DELETED_USER_ID = 'deleted-user';
/** `.invalid` (RFC 2606) — gerçek bir posta kutusu olamaz; User.email tekil ve zorunlu olduğu için gerekli. */
export const DELETED_USER_EMAIL = 'deleted-user@deleted.invalid';
/** DB'deki ad (mobil istemciler bunu gösterir). Web arayüzü `deleted` bayrağıyla çeviriyi kullanır. */
export const DELETED_USER_NAME = 'Silinmiş kullanıcı';

export function isDeletedUserId(id: string | null | undefined): boolean {
  return id === DELETED_USER_ID;
}
