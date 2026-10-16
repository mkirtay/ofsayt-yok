/**
 * POST /api/account-deletion/request — hesap numaralandırma ve kötüye kullanım korumaları: her durumda aynı yanıt,
 * hesap araması yanıttan SONRA (arka plan), IP ve e-posta başına sınır, Turnstile, e-posta loglara / Sentry'ye gitmez.
 * Hız sınırı gerçek modül (Redis tanımsız → instance içi sayaç); veritabanı ve e-posta sahte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  background: [] as (() => Promise<unknown>)[],
  request: vi.fn(async (_email: string, _locale: string) => 'sent' as string),
  turnstile: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok: boolean; status?: number; error?: string }),
  captured: [] as unknown[],
}));
vi.mock('@/lib/redis', () => ({ getRedisClient: () => null, withRedis: async () => null }));
vi.mock('@/server/backgroundTask', () => ({ runInBackground: (task: () => Promise<unknown>) => h.background.push(task) }));
vi.mock('@/server/account/deletionRequest', async (orig) => ({
  ...(await orig<typeof import('@/server/account/deletionRequest')>()),
  requestAccountDeletion: h.request,
}));
vi.mock('@/lib/security', async (orig) => ({
  ...(await orig<typeof import('@/lib/security')>()),
  checkTurnstileGate: h.turnstile,
}));
vi.mock('@/lib/logger', () => ({ captureWarning: (...a: unknown[]) => h.captured.push(a) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import handler, { DELETION_REQUEST_ACCEPTED } from '@/pages/api/account-deletion/request';

let ipSeq = 0;
function call(body: unknown, opts: { method?: string; ip?: string } = {}) {
  const out = { status: 0, json: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      out.headers[k] = v;
    },
    status(code: number) {
      out.status = code;
      return this;
    },
    json(v: unknown) {
      out.json = v;
      return this;
    },
  } as unknown as NextApiResponse;
  const req = {
    method: opts.method ?? 'POST',
    body,
    headers: { 'x-forwarded-for': opts.ip ?? `10.0.0.${++ipSeq}` },
    socket: {},
  } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res)).then(() => out);
}

async function drainBackground() {
  const tasks = h.background.splice(0);
  for (const t of tasks) await t();
}

const logs: unknown[][] = [];
beforeEach(() => {
  h.background = [];
  h.captured = [];
  h.request.mockReset().mockResolvedValue('sent');
  h.turnstile.mockReset().mockResolvedValue({ ok: true });
  logs.length = 0;
  for (const m of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a);
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/account-deletion/request', () => {
  it('her durumda aynı yanıt; hesap araması yanıt döndükten sonra arka planda', async () => {
    const bodies: unknown[] = [];
    for (const outcome of ['sent', 'no_account', 'protected', 'send_failed']) {
      h.request.mockResolvedValueOnce(outcome);
      const r = await call({ email: `kisi-${outcome}@example.invalid`, turnstileToken: 't', locale: 'tr' });
      expect(r.status).toBe(200);
      expect(r.headers['Cache-Control']).toBe('no-store');
      // Yanıt hazırken arama henüz yapılmadı → süre hesap var/yok'a bağlı değil.
      expect(h.request).not.toHaveBeenCalled();
      bodies.push(r.json);
      await drainBackground();
      expect(h.request).toHaveBeenCalledTimes(1);
      h.request.mockClear();
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b)))).toEqual(new Set([JSON.stringify(DELETION_REQUEST_ACCEPTED)]));
  });

  it("arka plandaki hata yanıtı değiştirmez; Sentry'ye e-posta değil yalnız hata kodu gider", async () => {
    h.request.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed on gizli@example.invalid'), { code: 'P2002' }));
    const r = await call({ email: 'gizli@example.invalid', turnstileToken: 't' });
    expect(r.status).toBe(200);
    await drainBackground();
    expect(JSON.stringify(h.captured)).not.toContain('gizli@example.invalid');
    expect(JSON.stringify(h.captured)).toContain('P2002');
  });

  it('e-posta adresi hiçbir log satırına yazılmaz', async () => {
    await call({ email: 'log-yok@example.invalid', turnstileToken: 't' });
    await drainBackground();
    await call({ email: 'gecersiz' });
    expect(JSON.stringify(logs)).not.toContain('log-yok@example.invalid');
  });

  it('dil (locale) arka plan işine geçer; bilinmeyen değer Türkçe', async () => {
    await call({ email: 'en@example.invalid', turnstileToken: 't', locale: 'en' });
    await call({ email: 'xx@example.invalid', turnstileToken: 't', locale: 'de' });
    await drainBackground();
    expect(h.request.mock.calls.map((c) => c[1])).toEqual(['en', 'tr']);
  });

  it('IP başına 15 dakikada 5: 6. istek 429 + Retry-After, arama yapılmaz', async () => {
    const ip = '192.0.2.10';
    for (let i = 0; i < 5; i++) expect((await call({ email: `ip${i}@example.invalid`, turnstileToken: 't' }, { ip })).status).toBe(200);
    const r = await call({ email: 'ip6@example.invalid', turnstileToken: 't' }, { ip });
    expect(r.status).toBe(429);
    expect(Number(r.headers['Retry-After'])).toBeGreaterThan(0);
    await drainBackground();
    expect(h.request).toHaveBeenCalledTimes(5);
  });

  it('e-posta başına saatte 3 bağlantı: sonrası yine 200 ve aynı gövde, ama e-posta gönderilmez (kanonik biçim aynı sayılır)', async () => {
    const variants = ['limit.kisi@gmail.com', 'LIMITKISI@gmail.com', 'limitkisi+a@gmail.com', 'limit.kisi@googlemail.com'];
    const results = [];
    for (const email of variants) results.push(await call({ email, turnstileToken: 't' }));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(results.map((r) => JSON.stringify(r.json))).size).toBe(1);
    await drainBackground();
    expect(h.request).toHaveBeenCalledTimes(3);
  });

  it('Turnstile başarısızsa 400, arama yapılmaz; anahtar yoksa 503', async () => {
    h.turnstile.mockResolvedValueOnce({ ok: false, status: 400, error: 'Güvenlik doğrulaması başarısız.' });
    const r = await call({ email: 'bot@example.invalid', turnstileToken: '' });
    expect(r.status).toBe(400);
    expect((r.json as { code: string }).code).toBe('TURNSTILE_FAILED');
    h.turnstile.mockResolvedValueOnce({ ok: false, status: 503, error: 'x' });
    expect((await call({ email: 'bot@example.invalid' })).status).toBe(503);
    await drainBackground();
    expect(h.request).not.toHaveBeenCalled();
  });

  it('biçimsiz e-posta 400; GET 405', async () => {
    for (const email of [undefined, '', 'a', 'a@', '@b', 'a@b@c', 'a b@c.d', 'x'.repeat(250) + '@b.co', 42]) {
      const r = await call({ email, turnstileToken: 't' });
      expect(r.status, String(email)).toBe(400);
    }
    expect((await call(undefined, { method: 'GET' })).status).toBe(405);
    await drainBackground();
    expect(h.request).not.toHaveBeenCalled();
  });
});
