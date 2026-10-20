/**
 * Marka — TEK KAYNAK. Ürün adı değişince yalnız `name` (gerekirse `shortName`, `tagline`, varsayılan alan adı) değişir;
 * sayfa başlıkları, meta/OG, JSON-LD, sitemap/robots, e-posta konuları ve çeviriler (`{{brand}}`) buradan okur.
 *
 * Bağımlılıksız ve küçük tutulur: `_app` ve i18n üzerinden her sayfanın ilk yük parçasına girer.
 * Logo/ikon dosyaları, dış paneller (OAuth, ödeme, Sentry, Vercel alan adı, cron) burada DEĞİL — elle güncellenir.
 */

/**
 * Canlı alan adı (canonical, sitemap, robots, OG/JSON-LD url, paylaşım linkleri); `NEXT_PUBLIC_SITE_URL` yoksa kullanılır.
 * Eski alan adı (ofsaytyok.app) sayfa isteklerinde 410 Gone döner (src/middleware.ts); API uçları mobil için açık.
 */
const DEFAULT_SITE_URL = 'https://www.getscor3.com';

/** Sondaki "/" atılır. `NEXT_PUBLIC_*` derlemede gömülür → sunucu ve istemcide aynı değer. */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');

export const BRAND = {
  /** Görünen ad (başlıklar, og:site_name, JSON-LD, e-posta). */
  name: 'Scor3',
  /** Dar alanlar için kısa ad. */
  shortName: 'Scor3',
  /** Boşluksuz ad: User-Agent, takvim PRODID gibi teknik kimlikler. */
  compactName: 'Scor3',
  /** Canonical kök (sonda "/" yok). Sayfalarda `lib/siteUrl.ts` `siteBaseUrl()` kullan. */
  siteUrl,
  /** Metinlerde gösterilen alan adı (ör. yasal metinler): `siteUrl`'in host'u. */
  domain: siteUrl.replace(/^https?:\/\//, ''),
  /** Herkese açık iletişim adresi (/iletisim, yasal metinler). Yeni posta kutusu kurulunca yalnız bu satır değişir. */
  contactEmail: 'info@getscor3.com',
  /**
   * Sosyal hesaplar (kullanıcı adı, "@" olmadan; Facebook'ta sayfa adresinin yolu); boş olanlar hiçbir yerde basılmaz
   * (footer bağlantıları, JSON-LD `sameAs`).
   */
  social: { instagram: 'getscor3', youtube: 'getscor3', x: 'getscor3', facebook: '' } as {
    instagram: string;
    youtube: string;
    x: string;
    facebook: string;
  },
  tagline: { tr: 'Canlı Skorlar · Maç Analizi · Puan Durumu', en: 'Live Scores · Match Analysis · Standings' },
  description: 'Türkiye ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri.',
} as const;

/**
 * Tahmin oyunu (ücretsiz, ödülsüz skor tahmini) — ad TEK KAYNAK. Ad kesinleşince (yön: "90+", 90arti.app) yalnız bu
 * nesne değişir; metinler `{{game}}` / `{{gameShort}}` ile okur. URL (`basePath`), API yolu (`/api/game`) ve tablo adları
 * (`Game*`) bilerek markadan bağımsız: ad değişince bağlantılar kırılmaz. Plan: docs/TAHMIN_OYUNU_PLANI.md.
 */
export const GAME_BRAND = {
  /** Görünen ad (geçici). */
  name: 'Tahmin Ligi',
  /** Dar alanlar (menü, rozet). */
  shortName: 'Tahmin',
  /** Boşluksuz teknik ad (analytics etiketi, dosya adı). "90+" için "90arti". */
  compactName: 'TahminLigi',
  /** Ayrı alan adı (ör. https://90arti.app); yoksa null → site içi `basePath`. */
  siteUrl: null as string | null,
  /** Site içi kök yol — markadan bağımsız sabit. */
  basePath: '/tahmin',
} as const;

/**
 * Eski marka (Frikik takma ad yasağı: kimse eski markanın adıyla resmi izlenim vermesin). Yalnız bu dosyada yazılır
 * (legacyBrand.guard.test.ts).
 */
export const LEGACY_BRAND_COMPACT = 'OfsaytYok';

/** Çevirilerde her zaman kullanılabilen değişkenler: `{{brand}}`, `{{siteDomain}}`, `{{contactEmail}}`, `{{game}}`, `{{gameShort}}`. */
export const BRAND_I18N_VARS: Readonly<Record<string, string>> = {
  game: GAME_BRAND.name,
  gameShort: GAME_BRAND.shortName,
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

/** Sayfa başlığı soneki: `"Puan Durumu | Scor3"`. */
export function brandTitle(title: string, sep: '|' | '—' = '|'): string {
  return `${title} ${sep} ${BRAND.name}`;
}

export type SocialNetwork = 'instagram' | 'youtube' | 'x' | 'facebook';

/** Dolu sosyal hesaplar, gösterim sırasıyla (footer). */
export function socialProfiles(): { network: SocialNetwork; label: string; url: string }[] {
  const { instagram, youtube, x, facebook } = BRAND.social;
  const all: { network: SocialNetwork; label: string; handle: string; url: string }[] = [
    { network: 'instagram', label: 'Instagram', handle: instagram, url: `https://www.instagram.com/${instagram}` },
    { network: 'youtube', label: 'YouTube', handle: youtube, url: `https://www.youtube.com/@${youtube}` },
    { network: 'x', label: 'X', handle: x, url: `https://x.com/${x}` },
    { network: 'facebook', label: 'Facebook', handle: facebook, url: `https://www.facebook.com/${facebook}` },
  ];
  return all.filter((p) => p.handle).map(({ network, label, url }) => ({ network, label, url }));
}

/** Dolu sosyal hesapların profil adresleri (JSON-LD `sameAs`). */
export function socialProfileUrls(): string[] {
  return socialProfiles().map((p) => p.url);
}
