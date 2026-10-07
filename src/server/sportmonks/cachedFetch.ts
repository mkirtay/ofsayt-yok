/**
 * Sportmonks'a giden TEK kapı (sunucu tarafı) — hem tarayıcı proxy'si (`/api/sportmonks/...`) hem de
 * sunucu içi çağrılar (SSR, API route'ları, cron/bot) buradan geçer. Amaç: upstream istek sayısı
 * ziyaretçi sayısından bağımsız olsun.
 *
 * - Kimlik: `SPORTMONKS_API_KEY` upstream'e `Authorization` başlığıyla gider, URL'de yoktur.
 * - Anahtar: `api_token` hariç normalize path + upstream'e giden sorgunun AYNISI (`canonicalQueryEntries`: sıralı
 *   anahtar, dizi değerleri sırasıyla tekrar; `%&=` kaçışlı) — `include=a&include=b` ile `include=a,b` çakışmaz.
 * - Süre: `sportmonksCacheTtl` (içeriğe/maç durumuna göre). "Yok" cevapları da (404/403/422, boş 200)
 *   cache'lenir (negatif cache).
 * - Katmanlar: instance içi bellek (L1, yalnız taze kayıt) → Redis (taze + eski). 4 KB'tan büyük gövde Redis'e gzip +
 *   base64 yazılır (`gz`; Sportmonks JSON'u ölçümde 4–11 kat küçüldü): depolama (Free plan 256 MB) ve otomatik pipeline'ın
 *   birleşik istek boyutu (10 MB) için. Sıkıştırılmış hali de sınırı aşarsa yalnız L1'de kalır.
 * - Tekil uçuş: aynı instance'ta aynı anahtar için tek upstream isteği; instance'lar arasında Redis
 *   `SET NX PX` kilidi — kilidi alamayan eski veri varsa onu verir, yoksa kısa süre cache'i yoklar.
 * - Sportmonks 429/5xx/ağ hatası/zaman aşımı → son geçerli veri (`stale: true`). Başka instance tazelerken kilide takılan
 *   istek de eski kaydı alır (`stale: true` + `concurrentRefresh`); istek izleme bunu "gecikmeli" saymaz.
 * - Zaman aşımı (AbortController): varsayılan `SPORTMONKS_TIMEOUT_MS.api` (API route'ları, cron, bot); sayfa
 *   render'ı `withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, …)` ile daha kısa bütçe verir. Bütçe çağrı
 *   başınadır ve kilit beklemesini de kapsar. Aynı instance'ta uçuştaki isteğe katılan çağrı o isteğin
 *   bütçesini paylaşır (en çok `api`).
 * - `subscription`/`rate_limit`/`timezone` yanıttan çıkarılır; kota Sentry'ye BURADAN raporlanır
 *   (her gerçek upstream isteği için bir kez).
 * - Havuz bekçisi (`poolGuard.ts`): 429 → havuz soğumaya girer, soğuma bitene kadar o havuza istek atılmaz (eski veri
 *   ya da anında 429); havuz azalınca kısa TTL'ler esner; her gerçek istek rota × havuz olarak sayılır.
 */
import { getRedisClient, MAX_REDIS_VALUE_BYTES, withRedis } from '@/lib/redis';
import { currentRequestRoute, reportSportmonksQuota, reportSportmonksRateLimited } from '@/services/sportmonks/quotaMonitor';
import { LIVE_TTL, sportmonksCacheTtl } from '@/services/sportmonks/cachePolicy';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { keepTurkeyTvStations } from '@/services/sportmonks/matchExtras';
import {
  cooldownSecondsFor429,
  learnPool,
  notePoolObservation,
  poolCooldownUntil,
  poolForPath,
  recordUpstreamCall,
  startPoolCooldown,
  resetPoolGuardForTests,
  stretchFreshSeconds,
} from './poolGuard';

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3';
// Ortam + şema sürümü öneki (bkz. lib/cacheNamespace.ts): `prod:v2:smc:...` / `prod:v2:smc-lock:...`.
const keyPrefix = () => `${cacheKeyPrefix()}smc:`;
const lockPrefix = () => `${cacheKeyPrefix()}smc-lock:`;
const LOCK_TTL_MS = 10_000;
const LOCK_WAIT_MS = 3_000;
const LOCK_POLL_MS = 150;
/** Bu boyuttan (JSON karakter) büyük gövde Redis'e sıkıştırılarak yazılır. */
const COMPRESS_MIN_CHARS = 4_000;
const L1_MAX_ENTRIES = 300;
const STRIPPED_FIELDS = ['subscription', 'rate_limit', 'timezone'] as const;
const NOT_FOUND_STATUSES = new Set([400, 403, 404, 422]);
const LIVE_CDN_MAX_SECONDS = 15;
const LIVE_CDN_SWR_SECONDS = 5;

/**
 * Upstream zaman aşımı (ms). Sayfa: SSR/ISR render'ı — Sportmonks'un olağan cevabı < 1 sn; 3 sn'de eski veri ya da
 * iskelet göstermek boş beklemekten iyi (Vercel fonksiyonu da CPU değil duvar saati sayar). API: tarayıcı proxy'si,
 * normalize uç noktalar, AI analiz bağlamı, cron/bot — istemci zaten yükleniyor gösteriyor, biraz daha sabır.
 */
export const SPORTMONKS_TIMEOUT_MS = { page: 3_000, api: 5_000 } as const;

export type SportmonksQuery = Record<string, string | string[] | undefined>;

type Entry = { status: number; body: unknown; fetchedAt: number; freshUntil: number; staleUntil: number };
/** Redis'teki biçim: küçük gövde aynen, büyük gövde `gz` (gzip + base64 JSON). Eski (sıkıştırılmamış) kayıtlar da okunur. */
type StoredEntry = Omit<Entry, 'body'> & { body?: unknown; gz?: string };

export type CacheOutcome = 'HIT' | 'MISS' | 'STALE' | 'BYPASS';

export type SportmonksCachedResult = {
  status: number;
  body: unknown;
  cache: CacheOutcome;
  /** Taze kalacağı kalan süre (sn) — CDN `s-maxage`. Hata / eski veri → 0. */
  freshForSeconds: number;
  /** Politikadaki taze süre (sn) — `stale-while-revalidate` hesabı için. */
  ttlSeconds: number;
  /** Upstream hata verdi, son geçerli veri döndü. */
  stale: boolean;
  /**
   * Eski kayıt upstream hatası yüzünden DEĞİL, başka bir instance aynı anahtarı tazelerken (Redis kilidi) verildi.
   * CDN / proxy için `stale` ile aynı (kısa cache); yalnız istek izleme bunu "gecikmeli" saymaz.
   */
  concurrentRefresh?: true;
  /** Havuz soğumada (429 sonrası): upstream'e GİDİLMEDİ — eski veri ya da anında 429. */
  rateLimited?: true;
};

export type CachedFetchOptions = {
  /** Kota olayında çağrının nereden geldiği (tarayıcı proxy'si mi sunucu mu). */
  origin?: 'proxy' | 'server';
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Bu çağrının bütçesi; verilmezse kapsam (`withSportmonksTimeout`) ya da `SPORTMONKS_TIMEOUT_MS.api`. */
  timeoutMs?: number;
};

// ─── İstek kapsamlı izleme ──────────────────────────────────────────────────

export type SportmonksFetchTracking = {
  /** En az bir cevap upstream hatası yüzünden son geçerli (eski) veriden geldi. */
  stale: boolean;
  /** En az bir istek upstream hatasıyla sonuçlandı ve verecek eski veri yoktu. */
  failed: boolean;
  /** Kapsamdaki Sportmonks çağrıları (önbellek isabetleri dahil). */
  calls: number;
  /** Bunlardan Sportmonks'a gerçekten giden (MISS / BYPASS / hata sonrası eski veri) — kota raporu için. */
  upstream: number;
};

type TrackingStore = {
  run: <R>(store: SportmonksFetchTracking, fn: () => R) => R;
  getStore: () => SportmonksFetchTracking | undefined;
};
let trackingStore: TrackingStore | null = null;

/**
 * Tembel `require`: bu modül `sportmonksRuntimeClient`'in dinamik import'u yüzünden istemci chunk grafiğine de
 * giriyor; üst düzey `node:async_hooks` import'u orada derlenmez.
 */
function tracking(): TrackingStore {
  if (!trackingStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    trackingStore = new AsyncLocalStorage<SportmonksFetchTracking>() as unknown as TrackingStore;
  }
  return trackingStore;
}

/**
 * `fn` içindeki tüm Sportmonks çağrılarının (servis katmanı hataları yutsa bile) eski veri / hata
 * durumunu toplar — normalize uç noktalar (`/api/matches/day`) bunu istemciye "veriler gecikmeli"
 * ya da 503 olarak iletir.
 */
export async function trackSportmonksFetches<T>(fn: () => Promise<T>): Promise<{ value: T } & SportmonksFetchTracking> {
  const state: SportmonksFetchTracking = { stale: false, failed: false, calls: 0, upstream: 0 };
  const value = await tracking().run(state, fn);
  return { value, ...state };
}

// ─── Zaman aşımı kapsamı ───────────────────────────────────────────────────

type TimeoutStore = {
  run: <R>(store: number, fn: () => R) => R;
  getStore: () => number | undefined;
};
let timeoutStore: TimeoutStore | null = null;

function timeoutScope(): TimeoutStore {
  if (!timeoutStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    timeoutStore = new AsyncLocalStorage<number>() as unknown as TimeoutStore;
  }
  return timeoutStore;
}

/** `fn` içindeki tüm Sportmonks çağrılarına `timeoutMs` bütçesi verir (ör. sayfa render'ı → `SPORTMONKS_TIMEOUT_MS.page`). */
export function withSportmonksTimeout<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  return timeoutScope().run(timeoutMs, fn);
}

function resolveTimeoutMs(opts: CachedFetchOptions): number {
  return opts.timeoutMs ?? timeoutScope().getStore() ?? SPORTMONKS_TIMEOUT_MS.api;
}

function noteOutcome(r: SportmonksCachedResult): SportmonksCachedResult {
  const t = tracking().getStore();
  if (t) {
    // Eşzamanlı tazelemeye takılan istek normal işleyiştir: "veriler gecikmeli" yalnızca gerçek upstream hatasında.
    if (r.stale && !r.concurrentRefresh) t.stale = true;
    if (r.cache === 'BYPASS' && (r.status >= 500 || r.status === 429)) t.failed = true;
    t.calls += 1;
    if (!r.rateLimited && (r.cache === 'MISS' || r.cache === 'BYPASS' || (r.stale && !r.concurrentRefresh))) t.upstream += 1;
  }
  return r;
}

// ─── Anahtar ────────────────────────────────────────────────────────────────

export function normalizeSportmonksPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

/**
 * Upstream'e giden sorgu çiftleri — önbellek anahtarı ve upstream URL'i AYNI listeden kurulur (zehirleme yok):
 * `path`/`api_token`/`undefined` hariç, anahtara göre sıralı, dizi değerleri gönderildiği sırayla ayrı çift.
 */
export function canonicalQueryEntries(query: SportmonksQuery): [string, string][] {
  const out: [string, string][] = [];
  for (const k of Object.keys(query).sort()) {
    const v = query[k];
    if (k === 'path' || k === 'api_token' || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) out.push([k, item]);
  }
  return out;
}

/** Anahtar biçimini bozan karakterler kaçışlanır; bunlar olmayan değerlerde anahtar eskisiyle aynı (önbellek korunur). */
const keyPart = (v: string) => v.replace(/[%&=]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function buildSportmonksCacheKey(path: string, query: SportmonksQuery): string {
  const parts = canonicalQueryEntries(query).map(([k, v]) => `${keyPart(k)}=${keyPart(v)}`);
  return `${keyPrefix()}${normalizeSportmonksPath(path)}?${parts.join('&')}`;
}

/**
 * Upstream yolu güvenli mi: `?`/`#`/`\\` yok (sorgu enjeksiyonu), `.`/`..` segmenti yok (`/v3` dışına çıkma).
 * Sunucu içi çağrılar yüzde-kodlu yol verebilir (`teams/search/fenerbah%C3%A7e`); `%2e`/`%2f` gibi kodlu nokta/eğik
 * çizgi de reddedilir.
 */
export function isSafeSportmonksPath(path: string): boolean {
  if (!path || /[?#\\\u0000-\u001f\u007f]/.test(path) || /%(2e|2f|5c)/i.test(path)) return false;
  return path.split('/').every((seg) => seg !== '.' && seg !== '..');
}

// ─── Katmanlar ──────────────────────────────────────────────────────────────

const l1 = new Map<string, Entry>();
const inFlight = new Map<string, Promise<SportmonksCachedResult>>();

function l1Get(key: string, now: number): Entry | null {
  const e = l1.get(key);
  if (!e) return null;
  if (e.freshUntil <= now) {
    l1.delete(key);
    return null;
  }
  return e;
}

function l1Set(key: string, e: Entry): void {
  if (l1.size >= L1_MAX_ENTRIES) {
    const oldest = l1.keys().next().value;
    if (oldest !== undefined) l1.delete(oldest);
  }
  l1.set(key, e);
}

/**
 * `node:zlib` — `process.getBuiltinModule` ile (Node ≥ 20.16 / 22.3): bu modül istemci chunk grafiğine de girdiği için
 * `require('node:zlib')` Turbopack'te tarayıcı paketine ~300 KB `browserify-zlib` dolgusu ekliyordu. Yoksa null →
 * sıkıştırma yok (gövde aynen, boyut sınırı yine geçerli).
 */
function zlib(): typeof import('node:zlib') | null {
  return typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function'
    ? (process.getBuiltinModule('node:zlib') ?? null)
    : null;
}

/** Redis'e yazılacak biçim; sınırı aşıyorsa null (yalnız L1). */
export function packEntry(e: Entry): StoredEntry | null {
  const json = JSON.stringify(e.body) ?? 'null';
  const z = json.length < COMPRESS_MIN_CHARS ? null : zlib();
  if (!z) return new TextEncoder().encode(json).length <= MAX_REDIS_VALUE_BYTES ? e : null;
  const gz = z.gzipSync(json).toString('base64');
  if (gz.length > MAX_REDIS_VALUE_BYTES) return null;
  const { body: _body, ...meta } = e;
  return { ...meta, gz };
}

/** Bozuk sıkıştırılmış kayıt → null (cache yokmuş gibi; upstream'den yenilenir). */
export function unpackEntry(s: StoredEntry): Entry | null {
  if (typeof s.gz !== 'string') return s as Entry;
  const z = zlib();
  if (!z) return null;
  try {
    const { gz, ...meta } = s;
    return { ...meta, body: JSON.parse(z.gunzipSync(Buffer.from(gz, 'base64')).toString('utf8')) };
  } catch {
    return null;
  }
}

// Redis erişimi `withRedis` üzerinden: zaman aşımı/hata/devre açık → cache yokmuş gibi devam (bkz. lib/redis.ts).
async function redisGet(key: string): Promise<Entry | null> {
  const stored = await withRedis((r) => r.get<StoredEntry>(key), null);
  return stored ? unpackEntry(stored) : null;
}

async function redisSet(key: string, e: Entry, now: number): Promise<void> {
  const stored = packEntry(e);
  if (!stored) return;
  const ex = Math.max(1, Math.ceil((e.staleUntil - now) / 1000));
  await withRedis((r) => r.set(key, stored, { ex }), null);
}

/** Kilit anahtarı veri anahtarından türetilir; önek tekrarlanmaz (`prod:v2:smc-lock:<path?query>`). */
function lockKey(key: string): string {
  return `${lockPrefix()}${key.slice(keyPrefix().length)}`;
}

/** Redis yok / erişilemiyor → kilit alınmış say (fail-open; instance içi tekil uçuş yine geçerli). */
async function tryLock(key: string): Promise<boolean> {
  if (!getRedisClient()) return true;
  return withRedis(async (r) => (await r.set(lockKey(key), 1, { nx: true, px: LOCK_TTL_MS })) === 'OK', true);
}

async function unlock(key: string): Promise<void> {
  await withRedis((r) => r.del(lockKey(key)), 0); // hata olursa kilit PX ile zaten düşer
}

// ─── Upstream ───────────────────────────────────────────────────────────────

export function stripSportmonksMeta(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out = { ...(body as Record<string, unknown>) };
  for (const f of STRIPPED_FIELDS) delete out[f];
  return out;
}

type UpstreamResult =
  | { status: number; body: unknown; retryAfter: string | null }
  | { status: 'network-error' }
  | { status: 'timeout' };

async function callUpstream(
  path: string,
  query: SportmonksQuery,
  opts: CachedFetchOptions,
  timeoutMs: number,
): Promise<UpstreamResult> {
  const apiToken = process.env.SPORTMONKS_API_KEY;
  if (!apiToken) throw new Error('Missing SPORTMONKS_API_KEY (sunucu ortam değişkeni tanımlı değil)');
  // Anahtar URL'ye YAZILMAZ: `Authorization` başlığıyla gider (Sportmonks v3 destekler, Bearer'sız). URL'deki
  // `api_token` Sentry fetch breadcrumb'ına (`http.query`) ve olası hata mesajlarına düşüyordu (güvenlik raporu Y1).
  const qs = new URLSearchParams(canonicalQueryEntries(query));

  let res: Response;
  let raw: unknown;
  // Zaman aşımı gövde okumayı da kapsar (sinyal yanıt akışını da keser).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // SPORTMONKS_UPSTREAM_BASE: yalnızca yük/kabul script'i için sahte upstream (scripts/load/simulate-visitors.mjs).
    const base = process.env.SPORTMONKS_UPSTREAM_BASE || SPORTMONKS_BASE;
    const url = new URL(`${base}/${path}?${qs.toString()}`);
    if (!url.href.startsWith(`${base}/`)) throw new Error('Sportmonks yolu tabanın dışına çıkıyor');
    res = await (opts.fetchImpl ?? fetch)(url.toString(), {
      signal: controller.signal,
      headers: { Authorization: apiToken },
    });
    raw = await res.json().catch(() => null);
  } catch {
    return { status: controller.signal.aborted ? 'timeout' : 'network-error' };
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted) return { status: 'timeout' };

  const rl = (raw as { rate_limit?: { requested_entity: string; remaining: number; resets_in_seconds: number } } | null)
    ?.rate_limit;
  const observedAt = (opts.now ?? Date.now)();
  if (rl) {
    learnPool(path, rl.requested_entity);
    notePoolObservation(rl.requested_entity, rl.remaining, rl.resets_in_seconds, observedAt);
    reportSportmonksQuota({
      pool: rl.requested_entity,
      remaining: rl.remaining,
      resetsInSeconds: rl.resets_in_seconds,
      path: `/${path}`,
      ...(opts.origin ? { origin: opts.origin } : {}),
    });
  } else {
    // Gövdede `rate_limit` yoksa (ör. 429) başlıktaki kalan sayı varsa o kullanılır; sıfırlanma bilinmiyor → 5 dk geçerli.
    const remaining = res.headers?.get?.('x-ratelimit-remaining');
    if (remaining && /^\d+$/.test(remaining)) notePoolObservation(poolForPath(path), Number(remaining), 300, observedAt);
  }
  // Yayıncı satırlarından yalnız Türkiye (bkz. matchExtras.keepTurkeyTvStations): cache'e ve istemciye küçük yanıt.
  return {
    status: res.status,
    body: keepTurkeyTvStations(stripSportmonksMeta(raw)),
    retryAfter: res.headers?.get?.('retry-after') ?? null,
  };
}

/** Cache'lenebilir mi: gerçek veri (200 + data) ya da kalıcı "yok" (404/403/422/400, boş 200). */
function isCacheable(status: number, body: unknown): boolean {
  if (NOT_FOUND_STATUSES.has(status)) return true;
  return status === 200 && body != null && typeof body === 'object';
}

function dataOf(body: unknown): unknown {
  return body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined;
}

function toResult(e: Entry, cache: CacheOutcome, now: number, stale = false): SportmonksCachedResult {
  return {
    status: e.status,
    body: e.body,
    cache,
    freshForSeconds: stale ? 0 : Math.max(0, Math.floor((e.freshUntil - now) / 1000)),
    ttlSeconds: Math.max(1, Math.round((e.freshUntil - e.fetchedAt) / 1000)),
    stale,
  };
}

async function refresh(
  key: string,
  path: string,
  query: SportmonksQuery,
  previous: Entry | null,
  opts: CachedFetchOptions,
  timeoutMs: number,
): Promise<SportmonksCachedResult> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const pool = poolForPath(path);

  // Havuz soğumada (429): upstream'e hiç gitme — eski veri varsa o, yoksa anında 429 (tekrar deneme yağmuru yok).
  const coolingUntil = await poolCooldownUntil(pool, startedAt);
  if (coolingUntil > startedAt) {
    if (previous && previous.staleUntil > startedAt) return { ...toResult(previous, 'STALE', startedAt, true), rateLimited: true };
    return {
      status: 429,
      body: { message: `Sportmonks hız sınırı: ${pool} havuzu ${Math.ceil((coolingUntil - startedAt) / 1000)} sn bekletiliyor` },
      cache: 'BYPASS',
      freshForSeconds: 0,
      ttlSeconds: 0,
      stale: false,
      rateLimited: true,
    };
  }

  const locked = await tryLock(key);
  if (!locked) {
    // Başka bir instance tazeliyor: eski veri varsa hemen onu ver, yoksa yazmasını bekle (bütçe içinde).
    if (previous) return { ...toResult(previous, 'STALE', now(), true), concurrentRefresh: true };
    const deadline = now() + Math.min(LOCK_WAIT_MS, timeoutMs);
    while (now() < deadline) {
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
      const e = await redisGet(key);
      if (e && e.freshUntil > now()) {
        l1Set(key, e);
        return toResult(e, 'HIT', now());
      }
    }
    // Kilit sahibi yazamadı (hata/timeout) → kalan bütçeyle kendimiz dene (fail-open).
  }

  try {
    const remainingMs = timeoutMs - (now() - startedAt);
    const up: UpstreamResult = remainingMs > 0 ? await callUpstream(path, query, opts, remainingMs) : { status: 'timeout' };
    const t = now();
    if (remainingMs > 0) {
      const route = currentRequestRoute();
      recordUpstreamCall({ pool: poolForPath(path), route, origin: opts.origin ?? 'server', status: up.status }, t);
      if (up.status === 429 && 'retryAfter' in up) {
        const limitedPool = poolForPath(path);
        const seconds = cooldownSecondsFor429(limitedPool, up.retryAfter, t);
        if (await startPoolCooldown(limitedPool, seconds, t)) {
          reportSportmonksRateLimited({ pool: limitedPool, path: `/${path}`, cooldownSeconds: seconds, route, ...(opts.origin ? { origin: opts.origin } : {}) });
        }
      }
    }
    if (typeof up.status === 'number' && 'body' in up && isCacheable(up.status, up.body)) {
      const ttl = sportmonksCacheTtl(path, up.status === 200 ? dataOf(up.body) : undefined, t, query);
      // Havuz azaldıysa kısa TTL'ler esner (canlı liste 30 sn → 90/180 sn); bkz. poolGuard.stretchFreshSeconds.
      const fresh = stretchFreshSeconds(ttl.fresh, poolForPath(path), t);
      const entry: Entry = {
        status: up.status,
        body: up.body,
        fetchedAt: t,
        freshUntil: t + fresh * 1000,
        staleUntil: t + Math.max(fresh, ttl.stale) * 1000,
      };
      l1Set(key, entry);
      await redisSet(key, entry, t);
      return toResult(entry, 'MISS', t);
    }
    // 429 / 5xx / ağ hatası / zaman aşımı → son geçerli veri
    if (previous && previous.staleUntil > t) return toResult(previous, 'STALE', t, true);
    if (up.status === 'network-error') {
      return { status: 502, body: { message: 'Sportmonks erişilemiyor' }, cache: 'BYPASS', freshForSeconds: 0, ttlSeconds: 0, stale: false };
    }
    if (up.status === 'timeout') {
      return { status: 504, body: { message: 'Sportmonks zaman aşımı' }, cache: 'BYPASS', freshForSeconds: 0, ttlSeconds: 0, stale: false };
    }
    return { status: up.status, body: up.body, cache: 'BYPASS', freshForSeconds: 0, ttlSeconds: 0, stale: false };
  } finally {
    if (locked) await unlock(key);
  }
}

/**
 * Sportmonks GET — paylaşımlı cache'ten ya da (gerekirse, tek seferde) upstream'den.
 * @param path `football/fixtures/date/2026-09-30` biçiminde (`/v3/` sonrası)
 */
export async function fetchSportmonksCached(
  path: string,
  query: SportmonksQuery,
  opts: CachedFetchOptions = {},
): Promise<SportmonksCachedResult> {
  const now = opts.now ?? Date.now;
  const normPath = normalizeSportmonksPath(path);
  if (!isSafeSportmonksPath(normPath)) throw new Error('Geçersiz Sportmonks yolu');
  const key = buildSportmonksCacheKey(normPath, query);
  const timeoutMs = resolveTimeoutMs(opts);

  const hot = l1Get(key, now());
  if (hot) return noteOutcome(toResult(hot, 'HIT', now()));

  const pending = inFlight.get(key);
  if (pending) return noteOutcome(await pending);

  const promise = (async () => {
    const stored = await redisGet(key);
    const t = now();
    if (stored && stored.freshUntil > t) {
      l1Set(key, stored);
      return noteOutcome(toResult(stored, 'HIT', t));
    }
    return refresh(key, normPath, query, stored && stored.staleUntil > t ? stored : null, opts, timeoutMs);
  })();

  inFlight.set(key, promise);
  try {
    return noteOutcome(await promise);
  } finally {
    inFlight.delete(key);
  }
}

/**
 * CDN başlığı: taze kalan süre kadar `s-maxage`, ardından 3×TTL `stale-while-revalidate`
 * (edge eski kopyayı verirken arkada tazeler). Eski veri (upstream hatası) kısa cache'lenir;
 * hata cevapları hiç cache'lenmez. Canlı veri (TTL ≤ LIVE_TTL: inplay, canlı tekil maç) CDN'de en çok
 * 15 + 5 sn — eski kopya 20 sn'den yaşlı verilmesin.
 */
export function sportmonksCacheControl(r: SportmonksCachedResult): string {
  if (r.stale) return 'public, s-maxage=15, stale-while-revalidate=60';
  if (r.cache === 'BYPASS' || r.freshForSeconds <= 0) return 'no-store';
  if (r.ttlSeconds <= LIVE_TTL) {
    return `public, s-maxage=${Math.min(r.freshForSeconds, LIVE_CDN_MAX_SECONDS)}, stale-while-revalidate=${LIVE_CDN_SWR_SECONDS}`;
  }
  const swr = Math.max(30, r.ttlSeconds * 3);
  return `public, s-maxage=${r.freshForSeconds}, stale-while-revalidate=${swr}`;
}

/** Test yardımcısı — instance içi durumu sıfırlar. */
export function resetSportmonksCacheForTests(): void {
  l1.clear();
  inFlight.clear();
  resetPoolGuardForTests();
}
