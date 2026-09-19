/**
 * Sitenin canonical base URL'i (sonda "/" yok). Sayfa canonical/OG etiketleriyle AYNI kaynak: `AUTH_URL`.
 * Sunucu tarafı; API yanıtlarındaki site-içi yolları (ör. `/avatars/ball.svg`) tam URL'e çevirmek için kullanılır.
 */
export function siteBaseUrl(): string {
  return (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'https://ofsaytyok.app').replace(/\/+$/, '');
}

/**
 * API ÇIKIŞI normalizasyonu: `image` alanı her zaman tam URL olarak döner. Depolama formatı DEĞİŞMEZ —
 * galeri avatarı DB'de göreli (`/avatars/x.svg`) kalır; mobil istemci göreli yolu çözemez, bu yüzden yanıtta base ile birleşir.
 * `null`/boş → `null`; zaten mutlak (`http/https`) → aynen.
 */
export function absoluteImageUrl(image: string | null | undefined, base: string = siteBaseUrl()): string | null {
  if (!image) return null;
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith('/') && !image.startsWith('//')) return `${base}${image}`;
  return image;
}

/** `{ ..., image }` taşıyan bir nesnenin `image`'ını mutlak yapar (diğer alanlar aynen). */
export function withAbsoluteImage<T extends { image?: string | null }>(obj: T): T {
  return { ...obj, image: absoluteImageUrl(obj.image) };
}
