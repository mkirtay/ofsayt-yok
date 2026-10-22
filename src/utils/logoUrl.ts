/**
 * Sportmonks görsellerinin (takım/lig logosu, bayrak, oyuncu fotoğrafı) TEK URL üreticisi — `TeamLogo` kullanır.
 *
 * Sportmonks CDN logoları orijinal boyutta (ör. 1200×1413, 184 KB) veriyor; 16 px'lik satırda gereksiz. Görüntü
 * boyutunun 2 katı (retina) genişlikte küçük webp istenir. `NEXT_PUBLIC_LOGO_PROXY`:
 * - `self` (varsayılan): kendi ucumuz `/api/img/logo` (sharp, 1 yıl immutable CDN cache).
 * - `wsrv`: ücretsiz wsrv.nl görsel proxy'si (Vercel maliyeti 0, dış bağımlılık).
 * - `off`: orijinal URL (bugünkü davranış).
 * next/image KULLANILMAZ: Hobby'de ayda 5.000 dönüşüm; aşılınca yeni görseller 402 ile kırılıyor.
 */
export const SPORTMONKS_IMAGE_ORIGIN = 'https://cdn.sportmonks.com/images/';

/** İzinli genişlikler (px) — uç bunların dışındakini reddeder (sonsuz varyant / kötüye kullanım olmasın). */
export const LOGO_WIDTHS = [32, 48, 64, 96, 128] as const;
export type LogoWidth = (typeof LOGO_WIDTHS)[number];

/**
 * Stadyum fotoğrafı (maç sayfası "Stadyum" kartı): logodan geniş, yalnız `soccer/venues/` yolunda izinli — Sportmonks
 * orijinali ~1000 px / ~200 KB JPEG. Uç diğer yollarda bu genişlikleri reddeder (logo varyant sayısı artmasın).
 */
export const VENUE_IMAGE_WIDTHS = [320, 640] as const;
export type VenueImageWidth = (typeof VENUE_IMAGE_WIDTHS)[number];
export type ImageWidth = LogoWidth | VenueImageWidth;
const VENUE_PATH_PREFIX = 'soccer/venues/';

export function isVenueImagePath(path: string): boolean {
  return path.startsWith(VENUE_PATH_PREFIX);
}

/** Yol için izinli genişlik mi (logo genişlikleri her yolda; stadyum genişlikleri yalnız stadyum fotoğrafında). */
export function isAllowedImageWidth(path: string, width: number): width is ImageWidth {
  if ((LOGO_WIDTHS as readonly number[]).includes(width)) return true;
  return isVenueImagePath(path) && (VENUE_IMAGE_WIDTHS as readonly number[]).includes(width);
}

export type LogoProxyMode = 'self' | 'wsrv' | 'off';

/** `soccer/teams/0/4192.png` gibi göreli yol: yalnız güvenli karakterler, `..` yok, görsel uzantısı. */
const PATH_RE = /^(?!.*\.\.)[a-z0-9][a-z0-9_\-/.]*\.(png|jpe?g|webp|gif|svg)$/i;

export function logoProxyMode(raw: string | undefined = process.env.NEXT_PUBLIC_LOGO_PROXY): LogoProxyMode {
  return raw === 'wsrv' || raw === 'off' ? raw : 'self';
}

/** Sportmonks CDN adresinden göreli yol; başka host / geçersiz yol → null. */
export function sportmonksImagePath(src: string): string | null {
  if (!src.startsWith(SPORTMONKS_IMAGE_ORIGIN)) return null;
  const path = src.slice(SPORTMONKS_IMAGE_ORIGIN.length).split(/[?#]/)[0]!;
  return isValidLogoPath(path) ? path : null;
}

export function isValidLogoPath(path: string): boolean {
  return path.length <= 200 && PATH_RE.test(path);
}

/** Görüntü boyutunun 2 katını karşılayan en küçük izinli genişlik (en çok 128). */
export function logoWidthFor(displayPx: number): LogoWidth {
  const want = Math.ceil(displayPx * 2);
  return LOGO_WIDTHS.find((w) => w >= want) ?? LOGO_WIDTHS[LOGO_WIDTHS.length - 1]!;
}

/**
 * Gösterilecek URL. Sportmonks dışı kaynaklar (yerel svg, haber görseli, bayrak proxy'si) aynen döner.
 * @param displayPx görüntülenen en büyük kenar (CSS px)
 */
export function logoSrc(src: string | null | undefined, displayPx: number, mode: LogoProxyMode = logoProxyMode()): string | null {
  if (!src) return null;
  if (mode === 'off') return src;
  const path = sportmonksImagePath(src);
  if (!path) return src;
  const w = logoWidthFor(displayPx);
  if (mode === 'wsrv') {
    const params = new URLSearchParams({
      url: `cdn.sportmonks.com/images/${path}`,
      w: String(w),
      h: String(w),
      fit: 'inside',
      we: '',
      output: 'webp',
      default: src,
    });
    return `https://wsrv.nl/?${params.toString()}`;
  }
  return `/api/img/logo?src=${encodeURI(path)}&w=${w}`;
}

/**
 * Stadyum fotoğrafı adresi: `displayPx` (CSS genişliği) ×2'yi karşılayan en küçük stadyum genişliği (en çok 640).
 * Sportmonks stadyum yolu değilse `null` (kart fotoğrafsız çizilir).
 */
export function venueImageSrc(src: string | null | undefined, displayPx: number, mode: LogoProxyMode = logoProxyMode()): string | null {
  if (!src) return null;
  const path = sportmonksImagePath(src);
  if (!path || !isVenueImagePath(path)) return null;
  if (mode === 'off') return src;
  const want = Math.ceil(displayPx * 2);
  const w = VENUE_IMAGE_WIDTHS.find((x) => x >= want) ?? VENUE_IMAGE_WIDTHS[VENUE_IMAGE_WIDTHS.length - 1]!;
  if (mode === 'wsrv') {
    const params = new URLSearchParams({ url: `cdn.sportmonks.com/images/${path}`, w: String(w), output: 'webp', default: src });
    return `https://wsrv.nl/?${params.toString()}`;
  }
  return `/api/img/logo?src=${encodeURI(path)}&w=${w}`;
}

/**
 * `logoSrc`'nin kendi ucumuza (`/api/img/logo`) yazdığı adresin Sportmonks orijinali; başka adres → null. `<img>` /
 * canvas yüklemesi hata verirse doğrudan CDN'e düşmek için (uç bozulsa da logo kırık görünmesin).
 */
export function originalLogoSrc(url: string): string | null {
  if (!url.startsWith('/api/img/logo?')) return null;
  const path = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('src');
  return path && isValidLogoPath(path) ? `${SPORTMONKS_IMAGE_ORIGIN}${path}` : null;
}
