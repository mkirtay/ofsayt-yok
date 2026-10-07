import { afterEach, describe, expect, it } from 'vitest';
import {
  ServerRuntimeClient,
  addBreadcrumb,
  captureException,
  createTransport,
  getCurrentScope,
  getIsolationScope,
  getSanitizedUrlString,
  httpRequestToRequestData,
  parseUrl,
  requestDataIntegration,
  resolvedSyncPromise,
  setCurrentClient,
} from '@sentry/core';
import { scrubSecretParams, scrubSentryBreadcrumb, scrubSentryEvent } from './sentryScrub';

const F = '[Filtered]';

/** Her hassas ad, farklı yazımlarıyla (büyük/küçük harf, `-`/`_`). */
const SENSITIVE_NAMES = [
  'api_token',
  'API-TOKEN',
  'token',
  'access_token',
  'refresh_token',
  'resetToken',
  'reset_token',
  'password',
  'newPassword',
  'currentPassword',
  'current_password',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'CRON_SECRET',
  'cronSecret',
];

const SECRET = 'S3CRETvalue';

describe('Sentry olay temizliği (güvenlik denetimi 2026-10-04 / rapor Y1-Y2)', () => {
  it('URL ve metindeki token / code / api_token değerleri gizlenir; diğerleri kalır', () => {
    expect(scrubSecretParams('https://x.app/auth/reset-password?token=abc123&lang=tr')).toBe(
      'https://x.app/auth/reset-password?token=[Filtered]&lang=tr',
    );
    expect(scrubSecretParams('GET /api/auth/callback/google?state=s&code=4/0Ab#x')).toBe(
      'GET /api/auth/callback/google?state=s&code=[Filtered]#x',
    );
    expect(scrubSecretParams('fetch failed https://api.sportmonks.com/v3/x?API_TOKEN=gizli')).toBe(
      'fetch failed https://api.sportmonks.com/v3/x?API_TOKEN=[Filtered]',
    );
    expect(scrubSecretParams('/hata?errorcode=5&tokenx=1')).toBe('/hata?errorcode=5&tokenx=1');
  });

  it.each(SENSITIVE_NAMES)('metin kalıpları: %s (?, &, #, form başı, JSON metni)', (name) => {
    for (const text of [
      `https://x.app/p?${name}=${SECRET}&page=2`,
      `?include=a&${name}=${SECRET}`,
      `/cb#${name}=${SECRET}`,
      `${name}=${SECRET}&email=a`,
      `{"${name}":"${SECRET}","page":2}`,
      `{"${name}": "${SECRET}"}`,
    ]) {
      const out = scrubSecretParams(text);
      expect(out, text).not.toContain(SECRET);
      expect(out).toContain(F);
    }
    expect(scrubSecretParams(`?include=a&${name}=${SECRET}&page=2`)).toContain('page=2');
  });

  it('`code` yalnız URL/sorgu parametresi olarak; düz metindeki "code=" ve nesne anahtarı `code` korunur', () => {
    expect(scrubSecretParams('error code=500')).toBe('error code=500');
    expect(scrubSecretParams('code=abc&state=s')).toBe('code=[Filtered]&state=s');
    const e = scrubSentryEvent({ extra: { code: 'P2002', meta: { code: 'P2025' } } });
    expect(e.extra).toEqual({ code: 'P2002', meta: { code: 'P2025' } });
  });

  it('Bearer değeri metinde gizlenir', () => {
    expect(scrubSecretParams('auth failed: Bearer abc.def-ghi')).toBe('auth failed: Bearer [Filtered]');
  });

  it('istek başlıkları, çerezler, sorgu, istisna ve breadcrumb', () => {
    const event = {
      message: 'link /api/auth/verify-email?token=t1',
      request: {
        url: 'https://x.app/api/auth/verify-email?token=t2',
        query_string: 'token=t3&a=1',
        headers: {
          Authorization: 'Bearer m',
          Cookie: 'next-auth.session-token=s',
          'set-cookie': 'a=b',
          'Proxy-Authorization': 'Basic p',
          'User-Agent': 'ua',
        },
        cookies: { a: 'b' },
      },
      exception: { values: [{ value: 'boom ?code=c1' }] },
      breadcrumbs: [{ message: 'nav', data: { url: '/x?api_token=k', to: '/auth/reset-password?token=t4' } }],
    };
    const out = scrubSentryEvent(structuredClone(event));
    const text = JSON.stringify(out);
    for (const secret of ['t1', 't2', 't3', 't4', 'c1', '=k', 'Bearer m', 'session-token', 'Basic p']) {
      expect(text).not.toContain(secret);
    }
    expect(out.request.headers).toEqual({ 'User-Agent': 'ua' });
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request.query_string).toBe('token=[Filtered]&a=1');
  });

  it('sorgu nesne / çift dizisi / metin biçimleri', () => {
    const a = scrubSentryEvent({ request: { query_string: { token: 'x', page: '2', API_TOKEN: 'y' } } });
    expect(a.request.query_string).toEqual({ token: F, page: '2', API_TOKEN: F });
    const b = scrubSentryEvent({ request: { query_string: [['code', 'y'], ['q', 'z'], ['resetToken', 'r']] } });
    expect(b.request.query_string).toEqual([['code', F], ['q', 'z'], ['resetToken', F]]);
    const c = scrubSentryEvent({ request: { query_string: 'q=z&password=p&page=3' } });
    expect(c.request.query_string).toBe('q=z&password=[Filtered]&page=3');
  });

  it.each(SENSITIVE_NAMES)('olayın her konumunda anahtar adı ile: %s', (name) => {
    const nested = { [name]: SECRET, keep: 'ok', list: [{ [name]: SECRET, keep: 'ok' }] };
    const event = {
      message: `fail ?${name}=${SECRET}`,
      request: {
        url: `https://x.app/api/a?${name}=${SECRET}&lang=tr`,
        query_string: { [name]: SECRET, lang: 'tr' },
        data: structuredClone(nested),
      },
      extra: { body: structuredClone(nested), url: `/a?${name}=${SECRET}` },
      contexts: { nextjs: { request_path: `/api/a?${name}=${SECRET}` }, custom: structuredClone(nested) },
      tags: { url: `/api/a?x=1&${name}=${SECRET}`, route: '/api/a' },
      exception: { values: [{ type: 'Error', value: `bad {"${name}":"${SECRET}"}` }] },
      breadcrumbs: [
        {
          category: 'http',
          data: {
            url: 'https://api.sportmonks.com/v3/football/leagues/600',
            'http.query': `?include=x&${name}=${SECRET}`,
            'http.fragment': `#${name}=${SECRET}`,
            'http.method': 'GET',
          },
        },
        { category: 'navigation', data: { from: `/a?${name}=${SECRET}`, to: `/b#${name}=${SECRET}` } },
        { category: 'console', message: `x ${name}=${SECRET}`, data: { arguments: ['req', { [name]: SECRET }, `?${name}=${SECRET}`] } },
      ],
    };
    const out = scrubSentryEvent(event);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    // hassas olmayan alanlar korunur
    expect(out.request.query_string).toMatchObject({ lang: 'tr' });
    expect(out.request.data).toMatchObject({ keep: 'ok', list: [{ keep: 'ok' }] });
    expect(out.tags.route).toBe('/api/a');
    expect(out.breadcrumbs[0]!.data!['http.method']).toBe('GET');
    expect(out.breadcrumbs[0]!.data!.url).toBe('https://api.sportmonks.com/v3/football/leagues/600');
    expect(out.breadcrumbs[0]!.data!['http.query']).toBe(`?include=x&${name}=${F}`);
    expect(out.contexts.nextjs.request_path).toBe(`/api/a?${name}=${F}`);
  });

  it('request.data metni: JSON → ayrıştırılıp temizlenir ve metin kalır; form kalıbı; düz metin', () => {
    const json = scrubSentryEvent({
      request: { data: JSON.stringify({ emailOrUsername: 'ali', password: 'p@ss', nested: { resetToken: 'rt' } }) },
    });
    expect(typeof json.request.data).toBe('string');
    expect(JSON.parse(json.request.data)).toEqual({ emailOrUsername: 'ali', password: F, nested: { resetToken: F } });

    const form = scrubSentryEvent({ request: { data: 'email=a%40b.c&newPassword=x1&currentPassword=x2&lang=tr' } });
    expect(form.request.data).toBe(`email=a%40b.c&newPassword=${F}&currentPassword=${F}&lang=tr`);

    const plain = scrubSentryEvent({ request: { data: 'merhaba dünya' } });
    expect(plain.request.data).toBe('merhaba dünya');

    const broken = scrubSentryEvent({ request: { data: '{"password":"p", bozuk' } });
    expect(broken.request.data).not.toContain('"p"');
  });

  it('scrubSentryBreadcrumb: fetch http.query, navigasyon, console arguments', () => {
    const fetchCrumb = scrubSentryBreadcrumb({
      category: 'http',
      type: 'http',
      data: { url: 'https://api.sportmonks.com/v3/x', 'http.query': `?api_token=${SECRET}&include=a`, status_code: 200 },
    });
    expect(fetchCrumb.data['http.query']).toBe(`?api_token=${F}&include=a`);
    expect(fetchCrumb.data.status_code).toBe(200);

    const nav = scrubSentryBreadcrumb({ category: 'navigation', data: { from: `/x?token=${SECRET}`, to: '/y' } });
    expect(nav.data).toEqual({ from: `/x?token=${F}`, to: '/y' });

    const con = scrubSentryBreadcrumb({
      category: 'console',
      message: `login {"password":"${SECRET}"}`,
      data: { arguments: ['login', { password: SECRET, user: 'u' }, [['token', SECRET]]], logger: 'console' },
    });
    expect(JSON.stringify(con)).not.toContain(SECRET);
    expect(con.data.arguments[1]).toEqual({ password: F, user: 'u' });
    expect(con.data.logger).toBe('console');
  });

  it('döngüsel nesnede patlamaz; girdiyi değiştirmez; derinlik sınırı ötesi gizlenir; sayı/boolean/null korunur', () => {
    const a: Record<string, unknown> = { name: 'a', token: SECRET, n: 1, b: true, z: null };
    a.self = a;
    a.arr = [a, { password: SECRET }];
    const out = scrubSentryEvent({ extra: { a } });
    const oa = out.extra.a as Record<string, unknown>;
    expect(oa.token).toBe(F);
    expect(oa.self).toBe(oa); // döngü kopyada korunur
    expect((oa.arr as unknown[])[1]).toEqual({ password: F });
    expect(oa).toMatchObject({ n: 1, b: true, z: null, name: 'a' });
    expect(a.token).toBe(SECRET); // canlı nesneye dokunulmaz (console breadcrumb arguments)

    let deep: Record<string, unknown> = { password: SECRET };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    const d = scrubSentryEvent({ extra: { deep } });
    expect(JSON.stringify(d)).not.toContain(SECRET);

    const err = new Error('e');
    const crumb = scrubSentryBreadcrumb({ category: 'console', data: { arguments: [err] } });
    expect(crumb.data.arguments[0]).toBe(err); // düz olmayan örnekler olduğu gibi
  });

  it('sdkProcessingMetadata (gönderilmez, canlı Scope taşır) dolaşılmaz', () => {
    const scopeLike = { token: 'canli' };
    const out = scrubSentryEvent({ sdkProcessingMetadata: { scopeLike }, extra: { token: SECRET } });
    expect(out.sdkProcessingMetadata.scopeLike).toBe(scopeLike);
    expect(out.extra.token).toBe(F);
  });

  it('geçersiz girdiler', () => {
    expect(scrubSentryEvent(null)).toBeNull();
    expect(scrubSentryBreadcrumb(undefined)).toBeUndefined();
    expect(scrubSentryEvent({})).toEqual({});
  });
});

/**
 * Gerçek SDK zinciri: @sentry/core istemcisi + requestDataIntegration (sunucu isteği → `event.request`) +
 * SDK'nın fetch breadcrumb biçimi (`url` sorgusuz, sorgu `http.query`'de; bkz. @sentry/node-core
 * outgoingFetchRequest `getBreadcrumbData`). `beforeSend`/`beforeBreadcrumb` bizim temizleyicimiz.
 */
describe('Sentry SDK zinciriyle (beforeBreadcrumb + beforeSend)', () => {
  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  it('istek gövdesi, başlıklar, çerezler, sorgu ve Sportmonks fetch breadcrumb\'ı gönderilmeden temizlenir', async () => {
    const sent: unknown[] = [];
    const client = new ServerRuntimeClient({
      dsn: 'https://public@o0.ingest.sentry.io/0',
      integrations: [requestDataIntegration()],
      stackParser: () => [],
      sendDefaultPii: false,
      beforeBreadcrumb: scrubSentryBreadcrumb,
      beforeSend: (event) => {
        const out = scrubSentryEvent(event);
        sent.push(structuredClone(out));
        return null; // ağa gitmesin
      },
      transport: (opts) => createTransport(opts, () => resolvedSyncPromise({})),
    });
    setCurrentClient(client);
    client.init();

    const fakeReq = {
      method: 'POST',
      url: `/api/auth/reset-password?token=${SECRET}&lang=tr`,
      headers: { host: 'x.app', authorization: `Bearer ${SECRET}`, cookie: `next-auth.session-token=${SECRET}`, 'user-agent': 'ua' },
      cookies: { 'next-auth.session-token': SECRET },
      body: { token: SECRET, password: SECRET, email: 'a@b.c' },
    };
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest: httpRequestToRequestData(fakeReq) });

    const parsed = parseUrl(`https://api.sportmonks.com/v3/football/leagues/600?include=seasons&api_token=${SECRET}`);
    addBreadcrumb({
      category: 'http',
      type: 'http',
      data: { status_code: 200, url: getSanitizedUrlString(parsed), 'http.method': 'GET', 'http.query': parsed.search },
    });

    captureException(new Error(`boom https://api.sportmonks.com/v3/x?api_token=${SECRET}`));
    await client.flush(100);

    expect(sent).toHaveLength(1);
    const ev = sent[0] as {
      request: { url: string; headers: Record<string, string>; cookies?: unknown; data: unknown; query_string: unknown };
      breadcrumbs: { data: Record<string, unknown> }[];
    };
    const { sdkProcessingMetadata: _meta, ...wire } = ev as Record<string, unknown>; // envelope'tan SDK siler
    expect(JSON.stringify(wire)).not.toContain(SECRET);
    // SDK alanlarının gerçekten doldurulduğunu da gösterir (test boşa geçmesin)
    expect(ev.request.url).toBe(`http://x.app/api/auth/reset-password?token=${F}&lang=tr`);
    expect(ev.request.headers).toMatchObject({ 'user-agent': 'ua' });
    expect(ev.request.headers).not.toHaveProperty('authorization');
    expect(ev.request.headers).not.toHaveProperty('cookie');
    expect(ev.request.cookies).toBeUndefined();
    expect(ev.request.data).toMatchObject({ email: 'a@b.c', token: F, password: F });
    const crumb = ev.breadcrumbs.find((b) => b.data?.['http.method'] === 'GET')!;
    expect(crumb.data.url).toBe('https://api.sportmonks.com/v3/football/leagues/600');
    expect(crumb.data['http.query']).toBe(`?include=seasons&api_token=${F}`);
  });
});
