/**
 * `GET /api/img/logo?src=<sportmonks yolu>&w=<32|48|64|96|128>` — Sportmonks logosunun küçük webp sürümü.
 *
 * - Açık proxy DEĞİL: yalnız `cdn.sportmonks.com/images/<güvenli yol>` (bkz. utils/logoUrl.ts), genişlik beyaz listede.
 * - Başarı: 1 yıl `immutable` (aynı yol + genişlik hep aynı çıktı) → fonksiyon yalnız CDN ıskasında çalışır.
 * - Upstream 404 → 404 (1 gün cache; logo gerçekten yok). Diğer hatalar → orijinal URL'ye 302 (5 dk) — görsel kırılmaz.
 */
import sharp from 'sharp';
import { LOGO_WIDTHS, SPORTMONKS_IMAGE_ORIGIN, isValidLogoPath, type LogoWidth } from '@/utils/logoUrl';

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 5_000;

export const LOGO_CACHE_OK = 'public, max-age=31536000, s-maxage=31536000, immutable';
const CACHE_MISSING = 'public, max-age=86400, s-maxage=86400';
const CACHE_FALLBACK = 'public, max-age=300, s-maxage=300';

export type LogoResult =
  | { status: 200; body: Buffer; headers: Record<string, string> }
  | { status: 302; location: string; headers: Record<string, string> }
  | { status: 400 | 404; headers: Record<string, string> };

export function parseLogoQuery(src: unknown, w: unknown): { path: string; width: LogoWidth } | null {
  if (typeof src !== 'string' || typeof w !== 'string') return null;
  const width = Number(w);
  if (!(LOGO_WIDTHS as readonly number[]).includes(width)) return null;
  if (!isValidLogoPath(src)) return null;
  return { path: src, width: width as LogoWidth };
}

export async function renderLogo(
  path: string,
  width: LogoWidth,
  fetchImpl: typeof fetch = fetch,
): Promise<LogoResult> {
  const original = `${SPORTMONKS_IMAGE_ORIGIN}${path}`;
  const fallback: LogoResult = { status: 302, location: original, headers: { 'Cache-Control': CACHE_FALLBACK } };
  let input: Buffer;
  try {
    const res = await fetchImpl(original, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (res.status === 404) return { status: 404, headers: { 'Cache-Control': CACHE_MISSING } };
    const type = res.headers.get('content-type') ?? '';
    const length = Number(res.headers.get('content-length') ?? 0);
    if (!res.ok || !type.startsWith('image/') || length > MAX_INPUT_BYTES) return fallback;
    input = Buffer.from(await res.arrayBuffer());
    if (input.byteLength > MAX_INPUT_BYTES) return fallback;
  } catch {
    return fallback;
  }

  try {
    const body = await sharp(input, { limitInputPixels: 25_000_000, animated: false })
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    return {
      status: 200,
      body,
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': LOGO_CACHE_OK, 'X-Content-Type-Options': 'nosniff' },
    };
  } catch {
    return fallback;
  }
}
