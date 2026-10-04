import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bellek içi sahte DB (gerçek DB / gerçek Hikie yok).
vi.mock('@/lib/prisma', async () => {
  const { createFakePaymentDb } = await import('@/test/fakePaymentDb');
  return { prisma: createFakePaymentDb() };
});

import { prisma } from '@/lib/prisma';
import type { FakePaymentDb } from '@/test/fakePaymentDb';
import { availablePackageKeys, checkoutUrl, findPaymentPackage } from '@/config/paymentPackages';
import { callbackMessage, hmacHex, signatureMatches, timestampFresh, verifyCallbackSignature, verifyWebhookSignature } from './hikieSignature';
import { CheckoutError, createCheckout, handleHikieCallback, handleHikieWebhook, refundOrder } from './paymentOrders';

const db = prisma as unknown as FakePaymentDb;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const DAY = 86_400_000;
const ENV = {
  HIKIE_LINK_CREDITS_10: 'https://pay.hikie.example/l/c10?ref=oy',
  HIKIE_SECRET_CREDITS_10: 'sec-c10',
  HIKIE_LINK_CREDITS_30: 'https://pay.hikie.example/l/c30',
  HIKIE_SECRET_CREDITS_30: 'sec-c30',
  HIKIE_LINK_PREMIUM_30D: 'https://pay.hikie.example/l/p30',
  HIKIE_SECRET_PREMIUM_30D: 'sec-p30',
  HIKIE_LINK_TEST_1TL: 'https://pay.hikie.example/l/t1',
  HIKIE_SECRET_TEST_1TL: 'sec-t1',
  HIKIE_WEBHOOK_SECRET: 'whsec',
};
const ts = (ms = NOW) => String(Math.floor(ms / 1000));

function signedQuery(secret: string, p: { merchantOrderId: string; orderId: string; status: string; timestamp?: string; isSuccess?: string }) {
  const timestamp = p.timestamp ?? ts();
  return {
    isSuccess: p.isSuccess ?? String(p.status === 'success'),
    status: p.status,
    orderId: p.orderId,
    merchantOrderId: p.merchantOrderId,
    timestamp,
    signature: hmacHex(secret, callbackMessage(timestamp, p.orderId, p.status)),
  };
}

async function seedUser(id: string, data: Record<string, unknown> = {}) {
  await db.user.create({ data: { id, ...data } });
}
async function seedOrder(merchantOrderId: string, packageKey: string, userId = 'u1', status = 'PENDING') {
  return db.paymentOrder.create({ data: { merchantOrderId, userId, packageKey, amountTRY: '0.00', status } });
}
const user = (id: string) => db.user.rows.find((r) => r.id === id)!;
const order = (m: string) => db.paymentOrder.rows.find((r) => r.merchantOrderId === m)!;

beforeEach(() => {
  db.reset();
});

describe('Hikie imzası', () => {
  it('geçerli imza; secret / alan değişirse red; bozuk biçim istisna atmaz', () => {
    const q = { timestamp: '1791000000', orderId: 'inv_1', status: 'success' };
    const sig = hmacHex('s', callbackMessage(q.timestamp, q.orderId, q.status));
    expect(verifyCallbackSignature('s', { ...q, signature: sig })).toBe(true);
    expect(verifyCallbackSignature('s', { ...q, signature: sig.toUpperCase() })).toBe(true);
    expect(verifyCallbackSignature('baska', { ...q, signature: sig })).toBe(false);
    expect(verifyCallbackSignature('s', { ...q, status: 'failed', signature: sig })).toBe(false);
    expect(signatureMatches(sig, 'zz')).toBe(false);
    expect(signatureMatches(sig, undefined)).toBe(false);
    expect(signatureMatches(sig, `sha256=${sig}`)).toBe(true);
    const body = '{"event":"order.paid"}';
    expect(verifyWebhookSignature('w', '1791000000', body, hmacHex('w', `1791000000.${body}`))).toBe(true);
    expect(verifyWebhookSignature('w', '1791000000', `${body} `, hmacHex('w', `1791000000.${body}`))).toBe(false);
  });

  it('zaman damgası: saniye ya da ms, 5 dk pencere (eski ve ileri)', () => {
    expect(timestampFresh(ts(NOW - 4 * 60_000), NOW)).toBe(true);
    expect(timestampFresh(String(NOW - 4 * 60_000), NOW)).toBe(true);
    expect(timestampFresh(ts(NOW - 6 * 60_000), NOW)).toBe(false);
    expect(timestampFresh(ts(NOW + 6 * 60_000), NOW)).toBe(false);
    expect(timestampFresh('abc', NOW)).toBe(false);
  });
});

describe('paket kataloğu', () => {
  it('fiyatlar ve env: link + secret ikisi de varsa satışta; yalnız https link', () => {
    expect(findPaymentPackage('credits_10')).toMatchObject({ kind: 'credits', credits: 10, priceKurus: 3999 });
    expect(findPaymentPackage('premium_365d')).toMatchObject({ kind: 'premium', days: 365, priceKurus: 79999 });
    expect(findPaymentPackage('test_1tl')).toMatchObject({ credits: 1, priceKurus: 100, adminOnly: true });
    expect(findPaymentPackage('yok')).toBeNull();
    expect(availablePackageKeys(ENV)).toEqual(['credits_10', 'credits_30', 'premium_30d', 'test_1tl']);
    expect(availablePackageKeys({ HIKIE_LINK_CREDITS_10: 'http://x', HIKIE_SECRET_CREDITS_10: 's' })).toEqual([]);
    expect(checkoutUrl('https://p.example/l/x?ref=oy', 'oy_1')).toBe('https://p.example/l/x?ref=oy&merchantOrderId=oy_1');
  });
});

describe('checkout', () => {
  it('PENDING sipariş + linke merchantOrderId; tutar paketten', async () => {
    await seedUser('u1');
    const r = await createCheckout('u1', 'credits_10', ENV);
    expect(r.url).toBe(`https://pay.hikie.example/l/c10?ref=oy&merchantOrderId=${r.merchantOrderId}`);
    expect(order(r.merchantOrderId)).toMatchObject({ userId: 'u1', packageKey: 'credits_10', amountTRY: '39.99', status: 'PENDING' });
  });

  it('bilinmeyen paket 400; env eksik paket 409; test paketi yalnız ADMIN', async () => {
    await seedUser('u1');
    await seedUser('a1', { role: 'ADMIN' });
    await expect(createCheckout('u1', 'yok', ENV)).rejects.toMatchObject({ status: 400 });
    await expect(createCheckout('u1', 'credits_100', ENV)).rejects.toMatchObject({ status: 409, code: 'UNAVAILABLE' });
    await expect(createCheckout('u1', 'test_1tl', ENV)).rejects.toBeInstanceOf(CheckoutError);
    expect(db.paymentOrder.rows).toHaveLength(0);
    const ok = await createCheckout('a1', 'test_1tl', ENV);
    expect(order(ok.merchantOrderId).amountTRY).toBe('1.00');
  });
});

describe('callback', () => {
  it('geçerli success: tek işlemde PAID + kredi + PURCHASE defter satırı (anahtar hikie:{orderId})', async () => {
    await seedUser('u1', { credits: 3 });
    await seedOrder('m1', 'credits_10');
    const r = await handleHikieCallback(signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_1', status: 'success' }), ENV, NOW);
    expect(r).toEqual({ status: 200, body: { ok: true, result: 'fulfilled' } });
    expect(order('m1')).toMatchObject({ status: 'PAID', hikieOrderId: 'inv_1' });
    expect(user('u1').credits).toBe(13);
    expect(db.creditTransaction.rows).toEqual([
      expect.objectContaining({ userId: 'u1', type: 'PURCHASE', amount: 10, balanceAfter: 13, idempotencyKey: 'hikie:inv_1' }),
    ]);
  });

  it('geçersiz imza / eski zaman damgası / BAŞKA paketin secret\'ı → 401, hiçbir şey değişmez', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const bad = { ...signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_1', status: 'success' }), signature: 'ab'.repeat(32) };
    expect((await handleHikieCallback(bad, ENV, NOW)).status).toBe(401);
    const stale = signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_1', status: 'success', timestamp: ts(NOW - 6 * 60_000) });
    expect(await handleHikieCallback(stale, ENV, NOW)).toEqual({ status: 401, body: { error: 'stale' } });
    // Kredi_30'un secret'ıyla imzalanmış istek kredi_10 siparişine geçmez
    const otherSecret = signedQuery('sec-c30', { merchantOrderId: 'm1', orderId: 'inv_1', status: 'success' });
    expect(await handleHikieCallback(otherSecret, ENV, NOW)).toEqual({ status: 401, body: { error: 'bad_signature' } });
    expect(order('m1').status).toBe('PENDING');
    expect(user('u1').credits).toBe(0);
    expect(db.creditTransaction.rows).toHaveLength(0);
  });

  it('çift callback idempotent: aynı istek ikinci kez işlemsiz 200; aynı Hikie ödemesi başka siparişe yazılmaz', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    await seedOrder('m2', 'credits_10');
    const q = signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_1', status: 'success' });
    await handleHikieCallback(q, ENV, NOW);
    expect(await handleHikieCallback(q, ENV, NOW)).toEqual({ status: 200, body: { ok: true, result: 'duplicate' } });
    const replay = signedQuery('sec-c10', { merchantOrderId: 'm2', orderId: 'inv_1', status: 'success' });
    expect((await handleHikieCallback(replay, ENV, NOW)).body.result).toBe('duplicate');
    expect(order('m2').status).toBe('PENDING');
    expect(user('u1').credits).toBe(10);
    expect(db.creditTransaction.rows).toHaveLength(1);
  });

  it('failed → FAILED (kredi yok); karar imzalı status\'tan, isSuccess\'e güvenilmez; ödenmiş sipariş FAILED olmaz', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const f = signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_1', status: 'failed', isSuccess: 'true' });
    expect((await handleHikieCallback(f, ENV, NOW)).body.result).toBe('failed');
    expect(order('m1').status).toBe('FAILED');
    expect(user('u1').credits).toBe(0);
    // Sonradan başarılı ödeme (yeniden deneme) FAILED siparişi tamamlar
    await handleHikieCallback(signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_2', status: 'success' }), ENV, NOW);
    expect(order('m1').status).toBe('PAID');
    const lateFail = signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_2', status: 'failed' });
    expect((await handleHikieCallback(lateFail, ENV, NOW)).body.result).toBe('duplicate');
    expect(order('m1').status).toBe('PAID');
  });

  it('premium: premiumUntil = max(şimdi, mevcut) + 30 gün; geçmişte görünsün diye 0 tutarlı PURCHASE satırı', async () => {
    const future = new Date(NOW + 10 * DAY);
    await seedUser('u1', { premiumUntil: future });
    await seedUser('u2', { premiumUntil: new Date(NOW - 5 * DAY) });
    await seedOrder('p1', 'premium_30d', 'u1');
    await seedOrder('p2', 'premium_30d', 'u2');
    await handleHikieCallback(signedQuery('sec-p30', { merchantOrderId: 'p1', orderId: 'inv_p1', status: 'success' }), ENV, NOW);
    await handleHikieCallback(signedQuery('sec-p30', { merchantOrderId: 'p2', orderId: 'inv_p2', status: 'success' }), ENV, NOW);
    expect((user('u1').premiumUntil as Date).getTime()).toBe(future.getTime() + 30 * DAY);
    expect((user('u2').premiumUntil as Date).getTime()).toBe(NOW + 30 * DAY);
    expect(db.premiumGrant.rows).toHaveLength(2);
    expect(db.creditTransaction.rows.every((r) => r.type === 'PURCHASE' && r.amount === 0)).toBe(true);
  });

  it('eksik parametre 400, bilinmeyen sipariş 404', async () => {
    expect((await handleHikieCallback({ status: 'success' }, ENV, NOW)).status).toBe(400);
    const q = signedQuery('sec-c10', { merchantOrderId: 'yok', orderId: 'inv_1', status: 'success' });
    expect((await handleHikieCallback(q, ENV, NOW)).status).toBe(404);
  });
});

describe('webhook ve iade', () => {
  const sign = (body: string, t = ts()) => ({
    'hikie-timestamp': t,
    'hikie-signature': hmacHex('whsec', `${t}.${body}`),
    'hikie-webhook-id': 'wh_1',
    'hikie-event': 'order.updated',
  });

  async function paid(credits: number, packageKey = 'credits_10') {
    await seedUser('u1', { credits });
    await seedOrder('m1', packageKey);
    const secret = packageKey === 'credits_10' ? 'sec-c10' : 'sec-p30';
    await handleHikieCallback(signedQuery(secret, { merchantOrderId: 'm1', orderId: 'inv_1', status: 'success' }), ENV, NOW);
  }

  it('secret yoksa 503; geçersiz imza 401', async () => {
    const body = '{}';
    expect((await handleHikieWebhook(sign(body), body, { ...ENV, HIKIE_WEBHOOK_SECRET: '' }, NOW)).status).toBe(503);
    expect((await handleHikieWebhook({ ...sign(body), 'hikie-signature': '00' }, body, ENV, NOW)).status).toBe(401);
    expect((await handleHikieWebhook(sign(body, ts(NOW - 10 * 60_000)), body, ENV, NOW)).status).toBe(401);
  });

  it('REFUNDED: sipariş REFUNDED, kredi geri alınır; aynı webhook id ikinci kez işlenmez', async () => {
    await paid(2); // 2 + 10 = 12
    const body = JSON.stringify({ event: 'order.updated', data: { orderId: 'inv_1', merchantOrderId: 'm1', status: 'REFUNDED' } });
    expect((await handleHikieWebhook(sign(body), body, ENV, NOW)).body.result).toBe('refunded');
    expect(order('m1').status).toBe('REFUNDED');
    expect(user('u1').credits).toBe(2);
    expect((await handleHikieWebhook(sign(body), body, ENV, NOW)).body.result).toBe('duplicate');
    expect(user('u1').credits).toBe(2);
    // Farklı teslimat kimliğiyle gelse bile ikinci iade yok
    expect((await handleHikieWebhook({ ...sign(body), 'hikie-webhook-id': 'wh_2' }, body, ENV, NOW)).body.result).toBe('noop');
    expect(db.creditTransaction.rows.filter((r) => r.type === 'REFUND')).toHaveLength(1);
  });

  it('bakiye yetmezse 0\'a kadar geri alınır, eksik not edilir (credits ≥ 0)', async () => {
    await paid(0); // 10
    await db.user.update({ where: { id: 'u1' }, data: { credits: 4 } }); // 6 kredi harcanmış
    const r = await refundOrder(order('m1').id as string, NOW);
    expect(r).toEqual({ result: 'refunded', shortfall: 6 });
    expect(user('u1').credits).toBe(0);
    const row = db.creditTransaction.rows.find((x) => x.type === 'REFUND')!;
    expect(row).toMatchObject({ amount: -4, balanceAfter: 0 });
    expect(row.note).toContain('6 kredi alınamadı');
  });

  it('premium iadesi premiumUntil\'i geri çeker; CANCELLED da iade sayılır', async () => {
    await paid(0, 'premium_30d');
    const body = JSON.stringify({ data: { orderId: 'inv_1', status: 'cancelled' } });
    await handleHikieWebhook(sign(body), body, ENV, NOW);
    expect(order('m1').status).toBe('REFUNDED');
    expect((user('u1').premiumUntil as Date).getTime()).toBe(NOW);
  });

  it('order.paid: callback gelmemiş siparişi tamamlar (idempotent)', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const body = JSON.stringify({ data: { orderId: 'inv_9', merchantOrderId: 'm1' } });
    const h = { ...sign(body), 'hikie-event': 'order.paid' };
    expect((await handleHikieWebhook(h, body, ENV, NOW)).body.result).toBe('fulfilled');
    expect(user('u1').credits).toBe(10);
    await handleHikieCallback(signedQuery('sec-c10', { merchantOrderId: 'm1', orderId: 'inv_9', status: 'success' }), ENV, NOW);
    expect(user('u1').credits).toBe(10);
  });
});
