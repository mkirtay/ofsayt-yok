import { describe, expect, it } from 'vitest';
import { scrubSecretParams, scrubSentryEvent } from './sentryScrub';

describe('Sentry olay temizliği (güvenlik denetimi 2026-10-04)', () => {
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

  it('istek başlıkları, çerezler, sorgu, istisna ve breadcrumb', () => {
    const event = {
      message: 'link /api/auth/verify-email?token=t1',
      request: {
        url: 'https://x.app/api/auth/verify-email?token=t2',
        query_string: 'token=t3&a=1',
        headers: { Authorization: 'Bearer m', Cookie: 'next-auth.session-token=s', 'User-Agent': 'ua' },
        cookies: { a: 'b' },
      },
      exception: { values: [{ value: 'boom ?code=c1' }] },
      breadcrumbs: [{ message: 'nav', data: { url: '/x?api_token=k', to: '/auth/reset-password?token=t4' } }],
    };
    const out = scrubSentryEvent(structuredClone(event));
    const text = JSON.stringify(out);
    for (const secret of ['t1', 't2', 't3', 't4', 'c1', '=k', 'Bearer m', 'session-token']) {
      expect(text).not.toContain(secret);
    }
    expect(out.request.headers).toEqual({ 'User-Agent': 'ua' });
    expect(out.request.query_string).toBe('token=[Filtered]&a=1');
  });

  it('sorgu nesne / çift dizisi biçimleri', () => {
    const a = scrubSentryEvent({ request: { query_string: { token: 'x', page: '2' } } });
    expect(a.request.query_string).toEqual({ token: '[Filtered]', page: '2' });
    const b = scrubSentryEvent({ request: { query_string: [['code', 'y'], ['q', 'z']] } });
    expect(b.request.query_string).toEqual([['code', '[Filtered]'], ['q', 'z']]);
  });
});
