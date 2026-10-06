import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ userId: null as string | null, rateOk: true }));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: async () => h.userId }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: async () => ({ success: h.rateOk, remaining: 0, resetAt: Date.now() + 1000 }) }));
vi.mock('@/lib/prisma', async () => {
  const { createFakePaymentDb } = await import('@/test/fakePaymentDb');
  return { prisma: createFakePaymentDb() };
});

import { prisma } from '@/lib/prisma';
import type { FakePaymentDb } from '@/test/fakePaymentDb';
import { hmacHex } from '@/server/payments/hikieSignature';
import checkout from '@/pages/api/payments/checkout';
import callback from '@/pages/api/payments/hikie/callback';
import webhook, { config as webhookConfig } from '@/pages/api/payments/hikie/webhook';
import orderApi from '@/pages/api/payments/order';

const db = prisma as unknown as FakePaymentDb;

function res() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
}
const run = async (handler: (q: NextApiRequest, s: NextApiResponse) => unknown, req: Record<string, unknown>) => {
  const r = res();
  await handler({ headers: {}, query: {}, ...req } as unknown as NextApiRequest, r as unknown as NextApiResponse);
  return r;
};

beforeEach(() => {
  db.reset();
  h.userId = null;
  h.rateOk = true;
  vi.stubEnv('HIKIE_LINK_CREDITS_10', 'https://pay.hikie.example/l/c10');
  vi.stubEnv('HIKIE_SECRET_CREDITS_10', 'sec-c10');
  vi.stubEnv('HIKIE_WEBHOOK_SECRET', 'whsec');
});

describe('POST /api/payments/checkout', () => {
  it('oturumsuz 401 (sipariş yazılmaz); GET 405', async () => {
    const r = await run(checkout, { method: 'POST', body: { packageKey: 'credits_10' } });
    expect(r.statusCode).toBe(401);
    expect(db.paymentOrder.rows).toHaveLength(0);
    expect((await run(checkout, { method: 'GET' })).statusCode).toBe(405);
  });

  it('oturumlu: PENDING sipariş + yönlendirme URL\'si; env eksik paket 409; rate limit 429', async () => {
    h.userId = 'u1';
    await db.user.create({ data: { id: 'u1' } });
    const r = await run(checkout, { method: 'POST', body: { packageKey: 'credits_10' } });
    expect(r.statusCode).toBe(200);
    const body = r.body as { url: string; merchantOrderId: string };
    expect(body.url).toBe(`https://pay.hikie.example/l/c10?merchantOrderId=${body.merchantOrderId}`);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect((await run(checkout, { method: 'POST', body: { packageKey: 'credits_100' } })).statusCode).toBe(409);
    h.rateOk = false;
    expect((await run(checkout, { method: 'POST', body: { packageKey: 'credits_10' } })).statusCode).toBe(429);
  });
});

describe('GET /api/payments/hikie/callback', () => {
  it('imzasız callback: 302 + kredi yok, sipariş PENDING; POST 405', async () => {
    await db.user.create({ data: { id: 'u1' } });
    const m = `oy_${'c'.repeat(32)}`;
    await db.paymentOrder.create({ data: { merchantOrderId: m, userId: 'u1', packageKey: 'credits_10', amountTRY: '39.99' } });
    const q = { isSuccess: 'true', status: 'success', orderId: 'inv_1', merchantOrderId: m };
    const ok = await run(callback, { method: 'GET', query: q });
    expect(ok.statusCode).toBe(302);
    expect(ok.headers.Location).toBe(`/odeme/tamamlandi?merchantOrderId=${m}`);
    expect(db.user.rows[0]!.credits).toBe(0);
    expect(db.paymentOrder.rows[0]).toMatchObject({ status: 'PENDING' });
    const failed = await run(callback, { method: 'GET', query: { ...q, status: 'failed' } });
    expect(failed.headers.Location).toBe('/odeme/tekrar-dene');
    expect((await run(callback, { method: 'POST', query: q })).statusCode).toBe(405);
  });
});

describe('POST /api/payments/hikie/webhook', () => {
  it('ham gövde ile imza doğrulanır (bodyParser kapalı); bozuk imza 401', async () => {
    expect(webhookConfig.api.bodyParser).toBe(false);
    const body = JSON.stringify({ event: 'ping' });
    const t = String(Math.floor(Date.now() / 1000));
    const mk = (sig: string) =>
      Object.assign(Readable.from([Buffer.from(body)]), {
        method: 'POST',
        headers: { 'hikie-timestamp': t, 'hikie-signature': sig, 'hikie-webhook-id': 'wh_1', 'hikie-event': 'ping' },
        query: {},
      });
    const ok = res();
    await webhook(mk(hmacHex('whsec', `${t}.${body}`)) as unknown as NextApiRequest, ok as unknown as NextApiResponse);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ ok: true, result: 'ignored' });
    const bad = res();
    await webhook(mk('00'.repeat(32)) as unknown as NextApiRequest, bad as unknown as NextApiResponse);
    expect(bad.statusCode).toBe(401);
  });
});

describe('GET /api/payments/order', () => {
  it('oturumsuz 401; başkasının siparişi görünmez (404)', async () => {
    expect((await run(orderApi, { method: 'GET', query: { merchantOrderId: `oy_${'a'.repeat(32)}` } })).statusCode).toBe(401);
    await db.user.create({ data: { id: 'u1' } });
    await db.user.create({ data: { id: 'u2', credits: 7 } });
    const m = `oy_${'b'.repeat(32)}`;
    await db.paymentOrder.create({ data: { merchantOrderId: m, userId: 'u1', packageKey: 'credits_10', amountTRY: '39.99' } });
    h.userId = 'u2';
    expect((await run(orderApi, { method: 'GET', query: { merchantOrderId: m } })).statusCode).toBe(404);
    h.userId = 'u1';
    const mine = await run(orderApi, { method: 'GET', query: { merchantOrderId: m } });
    expect(mine.statusCode).toBe(200);
    expect(mine.body).toMatchObject({ merchantOrderId: m, status: 'PENDING', credits: 0 });
  });
});
