/**
 * Paylaşım görsellerinin varlıkları: gömülü Inter (TTF alt kümesi) ve marka logosu — ağdan okunmaz; takım / lig
 * logoları Sportmonks CDN'inden 1,5 sn zaman aşımıyla çekilir, olmazsa çağıran baş harfleri çizer.
 */
import { INTER_OG_600_BASE64, INTER_OG_800_BASE64 } from './ogFonts.generated';

export { BRAND_LOGO_DATA_URI, BRAND_LOGO_ASPECT } from './brandLogo.generated';

export const OG_LOGO_TIMEOUT_MS = 1_500;
const MAX_LOGO_BYTES = 512 * 1024;
/** Logo yalnız bu host'lardan (veri Sportmonks'tan gelse de: sunucudan keyfi adrese istek atılmasın). */
const LOGO_HOSTS = new Set(['cdn.sportmonks.com']);

export type OgFont = { name: string; data: ArrayBuffer; weight: 600 | 800; style: 'normal' };

let fonts: OgFont[] | null = null;

function toArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function ogFonts(): OgFont[] {
  fonts ??= [
    { name: 'Inter', data: toArrayBuffer(INTER_OG_600_BASE64), weight: 600, style: 'normal' },
    { name: 'Inter', data: toArrayBuffer(INTER_OG_800_BASE64), weight: 800, style: 'normal' },
  ];
  return fonts;
}

/** Logo → data URI (satori ağdan kendi çekmesin: zaman aşımı bizde). Zaman aşımı / hata / izinsiz host → null. */
export async function fetchLogoDataUri(
  url: string | null | undefined,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !LOGO_HOSTS.has(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? OG_LOGO_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(parsed.toString(), { signal: controller.signal });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_LOGO_BYTES) return null;
    return await toSatoriImage(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * next/og (satori) yalnız PNG / JPEG / SVG çizer. Tür, başlığa değil içeriğe bakılarak belirlenir: Sportmonks bazı
 * logoları `image/png` başlığıyla WebP olarak veriyor (ör. Galatasaray). Diğer biçimler sharp ile 256 px PNG'ye çevrilir.
 */
export async function toSatoriImage(buf: Buffer): Promise<string | null> {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return `data:image/jpeg;base64,${buf.toString('base64')}`;
  const head = buf.subarray(0, 256).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return `data:image/svg+xml;base64,${buf.toString('base64')}`;
  }
  try {
    const { default: sharp } = await import('sharp');
    const png = await sharp(buf, { limitInputPixels: 25_000_000, animated: false }).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Logo yoksa: iki kelimeden fazlaysa ilk iki kelimenin baş harfleri, tek kelimede ilk harf (ör. "RO", "G"). */
export function teamInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = (w: string) => [...w][0] ?? '';
  return (words.length >= 2 ? first(words[0]!) + first(words[1]!) : first(words[0]!)).toLocaleUpperCase('tr-TR');
}
