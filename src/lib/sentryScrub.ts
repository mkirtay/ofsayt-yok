/**
 * Sentry olaylarından gizli değerleri ayıklar (sunucu + tarayıcı `beforeSend`): URL / sorgu / mesaj / breadcrumb'lardaki
 * `token`, `code`, `api_token` parametreleri (e-posta doğrulama / şifre sıfırlama / OAuth / Sportmonks) ve
 * `authorization` / `cookie` başlıkları. Sentry SDK'sını import etmez (tarayıcıda ilk açılışa yük bindirmez).
 */
const SECRET_PARAMS = ['token', 'code', 'api_token'];
const FILTERED = '[Filtered]';
const SECRET_PARAM_RE = new RegExp(`([?&#](?:${SECRET_PARAMS.join('|')})=)[^&#\\s"'<>]*`, 'gi');
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization']);

/** Metindeki `?token=…` / `&code=…` / `&api_token=…` değerlerini gizler. */
export function scrubSecretParams(text: string): string {
  return text.replace(SECRET_PARAM_RE, `$1${FILTERED}`);
}

function scrubQuery(q: unknown): unknown {
  if (typeof q === 'string') {
    const s = scrubSecretParams(q.startsWith('?') || q.startsWith('&') ? q : `&${q}`);
    return q.startsWith('?') || q.startsWith('&') ? s : s.slice(1);
  }
  if (Array.isArray(q)) {
    return q.map((pair) =>
      Array.isArray(pair) && SECRET_PARAMS.includes(String(pair[0]).toLowerCase()) ? [pair[0], FILTERED] : pair,
    );
  }
  if (q && typeof q === 'object') {
    return Object.fromEntries(
      Object.entries(q as Record<string, unknown>).map(([k, v]) => [k, SECRET_PARAMS.includes(k.toLowerCase()) ? FILTERED : v]),
    );
  }
  return q;
}

type ScrubbableEvent = {
  message?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: Record<string, string>;
    cookies?: unknown;
  };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
};

export function scrubSentryEvent<T>(event: T): T {
  const e = event as ScrubbableEvent;
  if (typeof e.message === 'string') e.message = scrubSecretParams(e.message);
  if (e.request) {
    if (typeof e.request.url === 'string') e.request.url = scrubSecretParams(e.request.url);
    if (e.request.query_string !== undefined) e.request.query_string = scrubQuery(e.request.query_string);
    if (e.request.headers) {
      for (const k of Object.keys(e.request.headers)) {
        if (SECRET_HEADERS.has(k.toLowerCase())) delete e.request.headers[k];
      }
    }
    delete e.request.cookies;
  }
  for (const v of e.exception?.values ?? []) {
    if (typeof v.value === 'string') v.value = scrubSecretParams(v.value);
  }
  for (const b of e.breadcrumbs ?? []) {
    if (typeof b.message === 'string') b.message = scrubSecretParams(b.message);
    if (b.data && typeof b.data.url === 'string') b.data.url = scrubSecretParams(b.data.url);
    if (b.data && typeof b.data.to === 'string') b.data.to = scrubSecretParams(b.data.to);
    if (b.data && typeof b.data.from === 'string') b.data.from = scrubSecretParams(b.data.from);
  }
  return event;
}
