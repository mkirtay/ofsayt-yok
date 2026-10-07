import { BRAND } from '@/config/brand';

/**
 * Sitenin canonical base URL'i (sonda "/" yok) — canonical/OG/JSON-LD/sitemap ve API yanıtlarındaki site-içi yollar
 * (ör. `/avatars/ball.svg`) için TEK kaynak. Sıra: `NEXT_PUBLIC_SITE_URL` → `AUTH_URL` → `NEXTAUTH_URL` → marka varsayılanı
 * (`config/brand.ts`). İstemcide yalnız `NEXT_PUBLIC_*` görünür; orada da marka varsayılanına düşer.
 */
export function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    BRAND.siteUrl
  ).replace(/\/+$/, '');
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
