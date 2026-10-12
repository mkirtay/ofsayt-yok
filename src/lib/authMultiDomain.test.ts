import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Aynı deployment iki alan adı sunar (www.ofsaytyok.app, www.getscor3.com). Google girişinin ikisinde de çalışması
 * şu davranışlara dayanır; biri bozulursa (NextAuth yükseltmesi, `cookies`/`redirect` ayarı eklenmesi) bu test düşer:
 *  - Vercel'de (VERCEL=1) NextAuth kökeni isteğin host'undan alır → callback o alan adına döner; NEXTAUTH_URL bunu ezmez.
 *  - Çerezler host'a özeldir (Domain yok) → iki alan adının oturumları birbirinden bağımsız, mevcut oturumlar etkilenmez.
 *  - Varsayılan redirect callback başka alan adına yönlendirmez (açık yönlendirme yok).
 */
vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-for-multi-domain-0123456789';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
});
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));

import NextAuth from 'next-auth';
import { encode, getToken } from 'next-auth/jwt';
import { authOptions } from './auth-options';

const DOMAINS = ['www.ofsaytyok.app', 'www.getscor3.com'];
const handler = NextAuth(authOptions) as (req: unknown, res: unknown) => Promise<void>;

/** `/api/auth/<path>` isteğini Pages API handler'ı üzerinden çalıştırır; gövde ve Set-Cookie satırlarını döndürür. */
async function call(host: string, path: string, cookies: Record<string, string> = {}) {
  const out = { body: undefined as unknown, setCookies: [] as string[] };
  const res = {
    status: () => res,
    setHeader: (key: string, value: string | string[]) => {
      if (key.toLowerCase() === 'set-cookie') out.setCookies = ([] as string[]).concat(value);
      return res;
    },
    getHeader: (key: string) => (key.toLowerCase() === 'set-cookie' ? out.setCookies : undefined),
    send: (b: unknown) => void (out.body = typeof b === 'string' ? JSON.parse(b) : b),
    json: (b: unknown) => void (out.body = b),
    end: () => undefined,
  };
  const req = {
    method: 'GET',
    headers: { host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' },
    query: { nextauth: path.split('/') },
    cookies,
    body: undefined,
  };
  await handler(req, res);
  return out;
}

const cookieNamed = (lines: string[], name: string) => lines.find((l) => l.startsWith(`${name}=`));

afterEach(() => vi.unstubAllEnvs());

describe('iki alan adında giriş (Vercel)', () => {
  it.each([undefined, 'https://www.ofsaytyok.app'])('callback isteğin host\'una döner (NEXTAUTH_URL=%s)', async (nextauthUrl) => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NEXTAUTH_URL', nextauthUrl);
    for (const host of DOMAINS) {
      const { body } = await call(host, 'providers');
      expect((body as Record<string, { callbackUrl: string }>).google.callbackUrl).toBe(
        `https://${host}/api/auth/callback/google`,
      );
    }
  });

  it('VERCEL / AUTH_TRUST_HOST yoksa NEXTAUTH_URL kökeni sabitler (yerelde AUTH_TRUST_HOST gerekir)', async () => {
    vi.stubEnv('VERCEL', undefined);
    vi.stubEnv('AUTH_TRUST_HOST', undefined);
    vi.stubEnv('NEXTAUTH_URL', 'https://www.ofsaytyok.app');
    const { body } = await call('www.getscor3.com', 'providers');
    expect((body as Record<string, { callbackUrl: string }>).google.callbackUrl).toBe(
      'https://www.ofsaytyok.app/api/auth/callback/google',
    );
  });

  it('çerezler host\'a özel (Domain yok) ve __Host-/__Secure- önekli', async () => {
    vi.stubEnv('VERCEL', '1');
    for (const host of DOMAINS) {
      const { setCookies } = await call(host, 'csrf');
      expect(cookieNamed(setCookies, '__Host-next-auth.csrf-token')).toBeDefined();
      expect(setCookies.length).toBeGreaterThan(0);
      for (const line of setCookies) expect(line).not.toMatch(/;\s*domain=/i);
    }
  });

  it('diğer alan adına callbackUrl verilirse aynı host\'a döner', async () => {
    vi.stubEnv('VERCEL', '1');
    const { setCookies } = await call('www.getscor3.com', 'csrf', {
      '__Secure-next-auth.callback-url': 'https://www.ofsaytyok.app/profile',
    });
    expect(cookieNamed(setCookies, '__Secure-next-auth.callback-url')).toMatch(
      /^__Secure-next-auth\.callback-url=https%3A%2F%2Fwww\.getscor3\.com;/,
    );
  });

  it.each([undefined, 'https://www.ofsaytyok.app'])(
    'mevcut oturum çerezi (__Secure-, AUTH_SECRET) okunmaya devam eder (NEXTAUTH_URL=%s)',
    async (nextauthUrl) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('NEXTAUTH_URL', nextauthUrl);
      const secret = process.env.AUTH_SECRET!;
      const jwt = await encode({ token: { sub: 'u1', tokenVersion: 0 }, secret });
      const req = { headers: {}, cookies: { '__Secure-next-auth.session-token': jwt } } as never;
      const token = await getToken({ req, secret });
      expect(token?.sub).toBe('u1');
    },
  );

  it('authOptions alan adı sabitleyen ayar içermez', () => {
    expect(authOptions.cookies).toBeUndefined();
    expect(authOptions.useSecureCookies).toBeUndefined();
    expect(authOptions.callbacks?.redirect).toBeUndefined();
  });
});
