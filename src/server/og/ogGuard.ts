/**
 * Paylaşım görseli uçlarının (`/api/og/*`) çizim öncesi korumaları.
 *
 * 1. Kanonik adres: CDN önbellek anahtarı tüm sorgu dizesini içerir. Fazladan / tekrarlanan anahtar, farklı sıra,
 *    baştaki sıfır ya da farklı kodlama yeni bir anahtar demektir → her biri ıska verip yeniden çizdirirdi. Uç, ham
 *    `req.url`'i kanonik biçimiyle karşılaştırır; tutmazsa ÇİZMEDEN kanonik adrese yönlendirir (yönlendirmenin kendisi de
 *    CDN'de önbelleğe girer, fonksiyon bir daha çalışmaz).
 * 2. Çizim bütçesi: kanonik adreslerin de sayısı büyük (maç × sürüm, frikik skorları). Yalnız CDN ıskasında çalışan çizim
 *    yolu IP başına ve global olarak sınırlanır; aşılınca varsayılan görsele 307 (CDN'de saklanmaz). Redis hatasında
 *    fail-open: çizim zaten CDN arkasında, limit ikinci katman.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { OG_CACHE } from './ogCache';
import { redirect } from './sendImage';

/** IP başına çizim (ve maç/takım için veri okuma) sınırı. */
export const OG_RENDER_IP_LIMIT = 30;
export const OG_RENDER_IP_WINDOW_MS = 60_000;
/** Tüm uçlar için ortak çizim bütçesi: 10 dakikada 300 çizim (~0,5/sn; tek çizim ~100–300 ms CPU). */
export const OG_RENDER_GLOBAL_LIMIT = 300;
export const OG_RENDER_GLOBAL_WINDOW_MS = 10 * 60_000;

const NEXT_REQUEST_META = Symbol.for('NextInternalRequestMeta');

/**
 * İsteğin HAM yol + sorgusu. Next, handler'dan önce `req.url`'i yeniden yazar (`normalizeCdnUrl`): sorguyu yeniden
 * kodlar ve `nxtP*` / rota parametresi (`id`) anahtarlarını siler. CDN anahtarı ise ham adres → karşılaştırma ham
 * adresle yapılmalı (`?v=F_2%2D1`, `&id=1`, `&nxtPx=1` gibi varyantlar yoksa ayırt edilemez). Ham adres Next'in istek
 * meta verisinde (`initURL`, next-server her istekte yazar); yoksa (birim test) `req.url`.
 */
export function rawPathAndQuery(req: Pick<NextApiRequest, 'url'>): string {
  const meta = (req as unknown as Record<symbol, { initURL?: unknown } | undefined>)[NEXT_REQUEST_META];
  const raw = typeof meta?.initURL === 'string' ? meta.initURL : (req.url ?? '');
  if (raw.startsWith('/')) return raw;
  try {
    const u = new URL(raw);
    return u.pathname + u.search;
  } catch {
    return raw;
  }
}

/**
 * Ham adres kanonik mi? Yol ve sorgu dizesi birebir aynı olmalı. Tek istisna: Vercel yönlendirmesi dinamik rota
 * parametresini sorguya kendisi ekler (`routes-manifest.json` → `?nxtPid=<yol parçası>`); yol parçasıyla AYNI değerli
 * en çok bir `nxtP<ad>=` (ve eski biçim `<ad>=`) çifti yok sayılır. Varyant sayısı sınırlı kalır (en çok birkaç).
 */
export function isCanonicalRequest(raw: string, canonical: string, routeParam?: { name: string; rawValue: string }): boolean {
  if (raw === canonical) return true;
  if (!routeParam) return false;
  const q = raw.indexOf('?');
  if (q === -1) return false;
  const path = raw.slice(0, q);
  const cq = canonical.indexOf('?');
  const canonicalPath = cq === -1 ? canonical : canonical.slice(0, cq);
  const canonicalSearch = cq === -1 ? '' : canonical.slice(cq + 1);
  if (path !== canonicalPath) return false;
  const pairs = raw.slice(q + 1).split('&');
  const ignorable = new Set([`nxtP${routeParam.name}=${routeParam.rawValue}`, `${routeParam.name}=${routeParam.rawValue}`]);
  const idx = pairs.findIndex((p) => ignorable.has(p));
  if (idx === -1) return false;
  pairs.splice(idx, 1);
  return pairs.join('&') === canonicalSearch;
}

/** `[['v', 'F_2-1']]` → `?v=F_2-1` (değer yoksa anahtar yazılmaz; hiç parametre yoksa boş). Sıra çağıranın verdiği sıra. */
export function canonicalQuery(params: ReadonlyArray<readonly [string, string | number | null | undefined]>): string {
  const parts = params
    .filter((p): p is readonly [string, string | number] => p[1] != null && p[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Tek değerli sorgu parametresi (tekrarlanan anahtarda ilki — kanonik karşılaştırma tekrarı zaten yakalar). */
export function firstQueryValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Yol parçasındaki sayısal kimliğin kanonik biçimi: 1–`maxDigits` hane, baştaki sıfırsız. Geçersizse null. */
export function canonicalNumericId(raw: unknown, maxDigits: number): string | null {
  const v = firstQueryValue(raw as string | string[] | undefined);
  if (typeof v !== 'string' || !new RegExp(`^\\d{1,${maxDigits}}$`).test(v)) return null;
  const n = Number(v);
  return n > 0 ? String(n) : null;
}

/**
 * İstek kanonik adreste değilse yönlendirir ve `true` döner (çağıran işi bitirir). Kanonik olmayan → kanonik eşlemesi
 * deterministik (adres verisine bağlı değil) olduğu için 308 + uzun önbellek. `routeParam`: dinamik rotanın ham yol
 * parçası (Vercel'in eklediği `nxtP…` çifti için, bkz. `isCanonicalRequest`).
 */
export function redirectIfNotCanonical(
  req: NextApiRequest,
  res: NextApiResponse,
  canonical: string,
  routeParam?: { name: string; rawValue: string },
): boolean {
  if (isCanonicalRequest(rawPathAndQuery(req), canonical, routeParam)) return false;
  redirect(res, canonical, OG_CACHE.canonicalRedirect, 308);
  return true;
}

/** Çizim bütçesi aşıldı → varsayılan görsel (CDN'de saklanmaz: limit geçince aynı adres yeniden çizilebilsin). */
export function redirectThrottled(res: NextApiResponse): void {
  redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.throttled);
}

/** IP başına sınır (çizimden ve maç/takım verisi okumadan önce). Aşıldıysa yönlendirir ve `false` döner. */
export async function allowOgWorkForIp(req: NextApiRequest, res: NextApiResponse, kind: string): Promise<boolean> {
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`og-render:ip:${ip}`, OG_RENDER_IP_LIMIT, OG_RENDER_IP_WINDOW_MS);
  if (rl.success) return true;
  console.warn(`[og-${kind}] ip limit`);
  redirectThrottled(res);
  return false;
}

/** Global çizim bütçesi (yalnız çizimden hemen önce). Aşıldıysa yönlendirir ve `false` döner. */
export async function allowOgRender(res: NextApiResponse, kind: string): Promise<boolean> {
  const rl = await hitFixedWindowRateLimit('og-render:global', OG_RENDER_GLOBAL_LIMIT, OG_RENDER_GLOBAL_WINDOW_MS);
  if (rl.success) return true;
  console.warn(`[og-${kind}] global render budget`);
  redirectThrottled(res);
  return false;
}

/** Ham adreste `prefix`'ten sonraki yol parçası (Vercel'in `nxtPid` değeri olarak eklediği biçim). */
export function rawPathSegment(req: Pick<NextApiRequest, 'url'>, prefix: string): string {
  const raw = rawPathAndQuery(req);
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  return path.startsWith(prefix) ? path.slice(prefix.length) : '';
}
