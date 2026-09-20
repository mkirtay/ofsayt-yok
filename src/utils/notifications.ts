import type { GundemNotification, GundemNotificationType } from '@/types/gundem';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export type NotificationView = {
  /** Ana satır: "Ada gönderini beğendi". */
  text: string;
  /** İkinci satır: ilgili gönderinin ilk ~60 karakteri (ya da "Gönderi silindi"). */
  snippet: string | null;
  /** Tıklanınca gidilecek yer; null → satır tıklanamaz (silinmiş gönderi, silinmiş kullanıcı). */
  href: string | null;
  /** Gönderisi silinmiş bildirim: satır soluk gösterilir. */
  muted: boolean;
};

const KEYS: Record<GundemNotificationType, string> = {
  POST_LIKE: 'notifications.postLike',
  POST_COMMENT: 'notifications.postComment',
  FOLLOW: 'notifications.follow',
  OFFICIAL_POST: 'notifications.officialPost',
};

const SNIPPET_MAX = 60;

function snippet(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1)}…` : flat;
}

function isKnownType(type: string): type is GundemNotificationType {
  return Object.prototype.hasOwnProperty.call(KEYS, type);
}

/**
 * Bildirim → görünüm eşlemesi (saf; `t` gundem namespace'i). Bilinmeyen `type` → null (çağıran satırı atlar, çökmez).
 * - `actor === null` (hesap silinmiş): isim yerine "Bir kullanıcı" ("Ofsayt Yok" resmi gönderi için).
 * - POST_*: hedef `/gundem/{postId}`; `post === null` (silinmiş) → tıklanamaz + soluk + "Gönderi silindi".
 * - FOLLOW: hedef aktörün profili; aktör yoksa tıklanamaz.
 */
export function describeNotification(n: GundemNotification, t: TFn): NotificationView | null {
  if (!isKnownType(n.type)) return null;

  const fallbackName = n.type === 'OFFICIAL_POST' ? t('notifications.official') : t('notifications.someone');
  const name = n.actor?.name ?? n.actor?.username ?? fallbackName;
  const text = t(KEYS[n.type], { name });

  if (n.type === 'FOLLOW') {
    return { text, snippet: null, href: n.actor ? `/gundem/kullanici/${n.actor.id}` : null, muted: false };
  }
  if (!n.post) {
    return { text, snippet: t('notifications.postDeleted'), href: null, muted: true };
  }
  return { text, snippet: snippet(n.post.body), href: `/gundem/${n.post.id}`, muted: false };
}
