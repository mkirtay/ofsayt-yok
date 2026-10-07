/**
 * Sentry olaylarından ve breadcrumb'lardan gizli değerleri ayıklar (sunucu + tarayıcı `beforeSend` /
 * `beforeBreadcrumb`). Olayın TAMAMI derin dolaşılır (güvenlik raporu Y1/Y2):
 * - Nesnelerde hassas ANAHTAR adı (büyük/küçük harf, `-`/`_` farkı gözetmeden: `api_token`, `password`,
 *   `resetToken`, `CRON_SECRET`, `set-cookie` …) → değer `[Filtered]`.
 * - Tüm string değerlerde (mesaj, URL, `request.query_string`, breadcrumb `http.query` / `http.fragment` / `url` /
 *   `to` / `from`, console `arguments`, istisna metni, etiketler, `contexts.nextjs.request_path` …):
 *   `?|&|#key=değer` biçimi (form gövdesi `key=değer&…` dahil), JSON metnindeki `"key":"değer"` ve `Bearer <değer>`.
 * - `request.data` metni JSON ise ayrıştırılıp temizlenir ve yeniden metne çevrilir; değilse form/sorgu kalıbıyla.
 * - `request.headers` içindeki authorization / cookie / set-cookie / proxy-authorization ve `request.cookies` silinir.
 * - `code` (OAuth dönüş kodu) yalnız URL/sorgu parametresi olarak gizlenir; nesne anahtarı `code` (ör. Prisma
 *   `P2002`) korunur.
 * Girdiyi değiştirmez (temiz kopya döner); döngüsel referans güvenli, derinlik sınırlı (`MAX_DEPTH`; ötesi `[Filtered]`).
 * Sentry SDK'sını import etmez (tarayıcıda ilk açılışa yük bindirmez).
 */
const FILTERED = '[Filtered]';
const MAX_DEPTH = 8;

/** Karşılaştırma biçimi: küçük harf, `-` / `_` / `.` yok (`API_TOKEN` = `api-token` = `apiToken`). */
const norm = (k: string) => k.toLowerCase().replace(/[-_.]/g, '');

const SENSITIVE_KEYS = new Set(
  [
    'api_token',
    'token',
    'access_token',
    'refresh_token',
    'resetToken',
    'password',
    'newPassword',
    'currentPassword',
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'secret',
    'CRON_SECRET',
  ].map(norm),
);
/** URL/sorgu parametresi olarak ayrıca gizlenen adlar (nesne anahtarında değil). */
const URL_ONLY_PARAMS = new Set(['code']);
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization']);

const isSensitiveKey = (k: string) => SENSITIVE_KEYS.has(norm(k));
const isSensitiveParam = (k: string) => isSensitiveKey(k) || URL_ONLY_PARAMS.has(norm(k));

// `?token=…`, `&api_token=…`, `#access_token=…`; form/sorgu metninin başı (`password=…&…`), boşluk ya da `;` sonrası.
const PARAM_RE = /(^|[?&#;\s])([A-Za-z0-9_.\-[\]]+)=([^&#\s"'<>]*)/g;
// JSON metni: `"password": "…"` (kaçışlı tırnaklar dahil) ya da `"token": 123`.
const JSON_PAIR_RE = /("([A-Za-z0-9_.-]+)"\s*:\s*)("(?:[^"\\]|\\.)*"|[^,}\]\s]+)/g;
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

/** Metindeki gizli parametre değerlerini gizler (URL, sorgu, form gövdesi, JSON metni, `Bearer …`). */
export function scrubSecretParams(text: string): string {
  return text
    .replace(PARAM_RE, (m, pre: string, key: string) => {
      const n = norm(key);
      if (SENSITIVE_KEYS.has(n)) return `${pre}${key}=${FILTERED}`;
      // `code` yalnız URL/sorgu ayıracından sonra (`?code=`, `&code=`, `#code=`) ya da metnin başında.
      if (URL_ONLY_PARAMS.has(n) && (pre === '' || pre === '?' || pre === '&' || pre === '#')) {
        return `${pre}${key}=${FILTERED}`;
      }
      return m;
    })
    .replace(JSON_PAIR_RE, (m, head: string, key: string) => (isSensitiveKey(key) ? `${head}"${FILTERED}"` : m))
    .replace(BEARER_RE, `$1${FILTERED}`);
}

/** JSON metniyse ayrıştırıp derin temizler ve metne geri çevirir; değilse metin kalıplarıyla temizler. */
function scrubMaybeJson(text: string): string {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.stringify(scrubDeep(JSON.parse(t), 0, new Map()));
    } catch {
      // JSON değil → metin kalıpları
    }
  }
  return scrubSecretParams(text);
}

function isPlainContainer(v: object): boolean {
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Derin temizlik — girdiyi DEĞİŞTİRMEZ, temizlenmiş kopya döner (console breadcrumb `arguments` uygulamanın canlı
 * nesnelerini taşıyabilir; yerinde değişiklik uygulama durumunu bozardı). Düz nesne/dizi dışındaki örnekler
 * (Error, Date, Scope …) olduğu gibi bırakılır; SDK olayı `beforeSend`'den önce düz nesneye normalize eder.
 * Döngü: aynı nesnenin kopyası yeniden kullanılır. `MAX_DEPTH` ötesindeki nesneler `[Filtered]`.
 */
function scrubDeep(value: unknown, depth: number, seen: Map<object, unknown>, skipKeys?: Set<string>): unknown {
  if (typeof value === 'string') return scrubSecretParams(value);
  if (!value || typeof value !== 'object' || !isPlainContainer(value)) return value;
  if (seen.has(value)) return seen.get(value);
  if (depth >= MAX_DEPTH) return FILTERED;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    // `['token', 'x']` biçimi (sorgu çiftleri / başlık dizileri)
    if (value.length === 2 && typeof value[0] === 'string' && isSensitiveKey(value[0])) {
      out.push(value[0], FILTERED);
      return out;
    }
    for (const item of value) out.push(scrubDeep(item, depth + 1, seen));
    return out;
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const k of Object.keys(src)) {
    let v: unknown;
    try {
      v = src[k];
    } catch {
      continue; // fırlatan getter
    }
    if (skipKeys?.has(k)) out[k] = v;
    else if (isSensitiveKey(k)) out[k] = v === undefined || v === null ? v : FILTERED;
    else out[k] = scrubDeep(v, depth + 1, seen);
  }
  return out;
}

function scrubQuery(q: unknown): unknown {
  if (typeof q === 'string') return scrubSecretParams(q);
  if (Array.isArray(q)) {
    return q.map((pair) => (Array.isArray(pair) && isSensitiveParam(String(pair[0])) ? [pair[0], FILTERED] : pair));
  }
  if (q && typeof q === 'object') {
    return Object.fromEntries(
      Object.entries(q as Record<string, unknown>).map(([k, v]) => [k, isSensitiveParam(k) ? FILTERED : v]),
    );
  }
  return q;
}

type ScrubbableRequest = {
  query_string?: unknown;
  data?: unknown;
  headers?: Record<string, unknown>;
  cookies?: unknown;
};

/** SDK iç verisi: gönderilmez (envelope'tan silinir) ve canlı Scope nesneleri taşır → dolaşılmaz. */
const EVENT_SKIP_KEYS = new Set(['sdkProcessingMetadata']);

export function scrubSentryEvent<T>(event: T): T {
  if (!event || typeof event !== 'object') return event;
  const out = scrubDeep(event, 0, new Map(), EVENT_SKIP_KEYS) as { request?: ScrubbableRequest };
  const req = out.request;
  if (req && typeof req === 'object') {
    if (req.headers && typeof req.headers === 'object') {
      for (const k of Object.keys(req.headers)) {
        if (SECRET_HEADERS.has(k.toLowerCase())) delete req.headers[k];
      }
    }
    delete req.cookies;
    if (req.query_string !== undefined) req.query_string = scrubQuery(req.query_string);
    if (typeof req.data === 'string') req.data = scrubMaybeJson(req.data);
  }
  return out as T;
}

/** `beforeBreadcrumb`: fetch/http `data` (`http.query`, `url` …), navigasyon `to`/`from`, console `arguments`. */
export function scrubSentryBreadcrumb<T>(breadcrumb: T): T {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;
  return scrubDeep(breadcrumb, 0, new Map()) as T;
}
