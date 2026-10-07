/**
 * Marka — TEK KAYNAK. Ürün adı değişince yalnız `name` (gerekirse `shortName`, `tagline`, varsayılan alan adı) değişir;
 * sayfa başlıkları, meta/OG, JSON-LD, sitemap/robots, e-posta konuları ve çeviriler (`{{brand}}`) buradan okur.
 *
 * Bağımlılıksız ve küçük tutulur: `_app` ve i18n üzerinden her sayfanın ilk yük parçasına girer.
 * Logo/ikon dosyaları, dış paneller (OAuth, ödeme, Sentry, Vercel alan adı, cron) burada DEĞİL — elle güncellenir.
 */

/** Canlı alan adı; `NEXT_PUBLIC_SITE_URL` yoksa kullanılır. */
const DEFAULT_SITE_URL = 'https://ofsaytyok.app';

/** Sondaki "/" atılır. `NEXT_PUBLIC_*` derlemede gömülür → sunucu ve istemcide aynı değer. */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');

export const BRAND = {
  /** Görünen ad (başlıklar, og:site_name, JSON-LD, e-posta). */
  name: 'Ofsayt Yok',
  /** Dar alanlar için kısa ad. */
  shortName: 'Ofsayt Yok',
  /** Boşluksuz ad: User-Agent, takvim PRODID gibi teknik kimlikler. */
  compactName: 'OfsaytYok',
  /** Canonical kök (sonda "/" yok). Sayfalarda `lib/siteUrl.ts` `siteBaseUrl()` kullan (env zinciri). */
  siteUrl,
  /** Metinlerde gösterilen alan adı (ör. yasal metinler): `siteUrl`'in host'u. */
  domain: siteUrl.replace(/^https?:\/\//, ''),
  /** Herkese açık iletişim adresi (/iletisim, yasal metinler). Yeni posta kutusu kurulunca yalnız bu satır değişir. */
  contactEmail: 'iletisim@ofsaytyok.app',
  /** Sosyal hesaplar (kullanıcı adı, "@" olmadan); boş olanlar hiçbir yerde basılmaz. */
  social: { x: '', instagram: '', youtube: '' } as { x: string; instagram: string; youtube: string },
  tagline: { tr: 'Canlı Skorlar · Maç Analizi · Puan Durumu', en: 'Live Scores · Match Analysis · Standings' },
  description: 'Türkiye ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri.',
} as const;

/** Çevirilerde her zaman kullanılabilen değişkenler: `{{brand}}`, `{{siteDomain}}`, `{{contactEmail}}`. */
export const BRAND_I18N_VARS: Readonly<Record<string, string>> = {
  brand: BRAND.name,
  siteDomain: BRAND.domain,
  contactEmail: BRAND.contactEmail,
};

/** Metindeki marka değişkenlerini doldurur; diğer `{{…}}` yer tutucularına dokunmaz. */
export function brandText(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => BRAND_I18N_VARS[k] ?? m);
}

/** Çeviri sözlüğünü (doğrudan import edilen JSON) derinlemesine `brandText`'ten geçirir; şekil korunur. */
export function withBrandText<T>(value: T): T {
  if (typeof value === 'string') return brandText(value) as T;
  if (Array.isArray(value)) return value.map(withBrandText) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withBrandText(v)])) as T;
  }
  return value;
}

/** Sayfa başlığı soneki: `"Puan Durumu | Ofsayt Yok"`. */
export function brandTitle(title: string, sep: '|' | '—' = '|'): string {
  return `${title} ${sep} ${BRAND.name}`;
}

/** Dolu sosyal hesapların profil adresleri (JSON-LD `sameAs`). */
export function socialProfileUrls(): string[] {
  const { x, instagram, youtube } = BRAND.social;
  return [
    x && `https://x.com/${x}`,
    instagram && `https://www.instagram.com/${instagram}`,
    youtube && `https://www.youtube.com/@${youtube}`,
  ].filter((u): u is string => Boolean(u));
}
