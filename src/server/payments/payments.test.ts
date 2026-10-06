import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bellek içi sahte DB (gerçek DB / gerçek Hikie yok).
vi.mock('@/lib/prisma', async () => {
  const { createFakePaymentDb } = await import('@/test/fakePaymentDb');
  return { prisma: createFakePaymentDb() };
});

import { prisma } from '@/lib/prisma';
import type { FakePaymentDb } from '@/test/fakePaymentDb';
import { availablePackageKeys, checkoutUrl, findPaymentPackage } from '@/config/paymentPackages';
import { hmacHex, signatureMatches, timestampFresh, verifyWebhookSignature } from './hikieSignature';
import { CheckoutError, createCheckout, handleHikieCallback, handleHikieWebhook, parseHikieWebhook, refundOrder } from './paymentOrders';

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
const PRICE: Record<string, string> = { credits_10: '39.99', credits_30: '99.99', premium_30d: '99.99', test_1tl: '1.00' };
const ts = (ms = NOW) => String(Math.floor(ms / 1000));

async function seedUser(id: string, data: Record<string, unknown> = {}) {
  await db.user.create({ data: { id, ...data } });
}
async function seedOrder(merchantOrderId: string, packageKey: string, userId = 'u1', status = 'PENDING') {
  return db.paymentOrder.create({ data: { merchantOrderId, userId, packageKey, amountTRY: PRICE[packageKey] ?? '0.00', status } });
}
const user = (id: string) => db.user.rows.find((r) => r.id === id)!;
const order = (m: string) => db.paymentOrder.rows.find((r) => r.merchantOrderId === m)!;

beforeEach(() => {
  db.reset();
});

describe('Hikie imzası', () => {
  it('webhook imzası geçerli; secret / gövde değişirse red; bozuk biçim istisna atmaz', () => {
    const sig = hmacHex('s', 'x');
    expect(signatureMatches(sig, sig.toUpperCase())).toBe(true);
    expect(signatureMatches(sig, 'zz')).toBe(false);
    expect(signatureMatches(sig, undefined)).toBe(false);
    expect(signatureMatches(sig, `sha256=${sig}`)).toBe(true);
    const body = '{"event":"order.paid"}';
    expect(verifyWebhookSignature('w', '1791000000', body, hmacHex('w', `1791000000.${body}`))).toBe(true);
    expect(verifyWebhookSignature('x', '1791000000', body, hmacHex('w', `1791000000.${body}`))).toBe(false);
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

const M1 = `oy_${'a'.repeat(32)}`;
const M2 = `oy_${'b'.repeat(32)}`;

describe('callback (imzasız)', () => {
  it('ASLA kredi vermez: status=success / isSuccess=true olsa bile sipariş PENDING, kredi 0; yalnız callbackAt işaretlenir', async () => {
    await seedUser('u1');
    await seedOrder(M1, 'credits_10');
    const r = await handleHikieCallback({ status: 'success', isSuccess: 'true', isSucess: 'true', orderId: 'inv_1', merchantOrderId: M1 }, NOW);
    expect(r.location).toBe(`/odeme/tamamlandi?merchantOrderId=${M1}`);
    expect(order(M1)).toMatchObject({ status: 'PENDING', hikieOrderId: null });
    expect(order(M1).callbackAt).toEqual(new Date(NOW));
    expect(user('u1').credits).toBe(0);
    expect(db.creditTransaction.rows).toHaveLength(0);
  });

  it('failed → tekrar-dene sayfası; sipariş durumu değişmez; bilinmeyen / bozuk merchantOrderId sayfaya düşer', async () => {
    await seedUser('u1');
    await seedOrder(M1, 'credits_10');
    expect((await handleHikieCallback({ status: 'failed', merchantOrderId: M1 }, NOW)).location).toBe('/odeme/tekrar-dene');
    expect(order(M1).status).toBe('PENDING');
    expect((await handleHikieCallback({ status: 'success', merchantOrderId: 'http://evil' }, NOW)).location).toBe('/odeme/tamamlandi');
    expect((await handleHikieCallback({}, NOW)).location).toBe('/odeme/tamamlandi');
  });

  it('callbackAt ilk gelişte yazılır, tekrarda ezilmez', async () => {
    await seedUser('u1');
    await seedOrder(M1, 'credits_10');
    await handleHikieCallback({ merchantOrderId: M1 }, NOW);
    await handleHikieCallback({ merchantOrderId: M1 }, NOW + 60_000);
    expect(order(M1).callbackAt).toEqual(new Date(NOW));
  });
});

describe('webhook ve iade', () => {
  const paidBody = (merchantOrderId: string, orderId: string, amount: string | number, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ event: 'order.paid', data: { orderId, merchantOrderId, amount, currency: 'TRY', ...extra } });
  const sign = (body: string, t = ts()) => ({
    'hikie-timestamp': t,
    'hikie-signature': hmacHex('whsec', `${t}.${body}`),
    'hikie-webhook-id': 'wh_1',
    'hikie-event': 'order.updated',
  });

  async function paid(credits: number, packageKey = 'credits_10') {
    await seedUser('u1', { credits });
    await seedOrder('m1', packageKey);
    const body = paidBody('m1', 'inv_1', PRICE[packageKey]!);
    await handleHikieWebhook({ ...sign(body), 'hikie-event': 'order.paid', 'hikie-webhook-id': 'wh_paid' }, body, ENV, NOW);
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

  const paidHeaders = (body: string, id = 'wh_p1') => ({ ...sign(body), 'hikie-event': 'order.paid', 'hikie-webhook-id': id });

  it('order.paid: imzalı + eşleşen sipariş / tutar → kredi (bir kez); tekrar gönderim ve farklı teslimat kimliği kredi eklemez', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const body = paidBody('m1', 'inv_9', 39.99);
    expect((await handleHikieWebhook(paidHeaders(body), body, ENV, NOW)).body.result).toBe('fulfilled');
    expect(order('m1')).toMatchObject({ status: 'PAID', hikieOrderId: 'inv_9' });
    expect(user('u1').credits).toBe(10);
    expect((await handleHikieWebhook(paidHeaders(body), body, ENV, NOW)).body.result).toBe('duplicate');
    expect((await handleHikieWebhook(paidHeaders(body, 'wh_p2'), body, ENV, NOW)).body.result).toBe('duplicate');
    expect(user('u1').credits).toBe(10);
    expect(db.creditTransaction.rows).toHaveLength(1);
  });

  it('order.paid imzasız / yanlış imzalı / eski → kredi yok', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const body = paidBody('m1', 'inv_9', '39.99');
    const noSig = { ...paidHeaders(body) } as Record<string, string>;
    delete noSig['hikie-signature'];
    expect((await handleHikieWebhook(noSig, body, ENV, NOW)).status).toBe(400);
    expect((await handleHikieWebhook({ ...paidHeaders(body), 'hikie-signature': hmacHex('baska', 'x') }, body, ENV, NOW)).status).toBe(401);
    expect((await handleHikieWebhook(paidHeaders(body), body, { ...ENV, HIKIE_WEBHOOK_SECRET: 'baska' }, NOW)).status).toBe(401);
    expect((await handleHikieWebhook({ ...sign(body, ts(NOW - 10 * 60_000)), 'hikie-event': 'order.paid', 'hikie-webhook-id': 'w9' }, body, ENV, NOW)).status).toBe(401);
    expect(order('m1').status).toBe('PENDING');
    expect(user('u1').credits).toBe(0);
  });

  it('yanlış tutar / tutar yok / yanlış para birimi / bilinmeyen sipariş → kredi yok, olay "rejected" olarak kaydedilir', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const cases: [string, string, string][] = [
      [paidBody('m1', 'inv_1', '1.00'), 'amount_mismatch', 'w1'],
      [JSON.stringify({ event: 'order.paid', data: { orderId: 'inv_1', merchantOrderId: 'm1' } }), 'amount_missing', 'w2'],
      [paidBody('m1', 'inv_1', '39.99', { currency: 'USD' }), 'currency_mismatch', 'w3'],
      [paidBody('yok', 'inv_1', '39.99'), 'unknown_order', 'w4'],
      [JSON.stringify({ event: 'order.paid', data: { orderId: 'inv_1', amount: '39.99' } }), 'missing_fields', 'w5'],
    ];
    for (const [body, reason, id] of cases) {
      const r = await handleHikieWebhook(paidHeaders(body, id), body, ENV, NOW);
      expect(r).toEqual({ status: 200, body: { ok: true, result: `rejected:${reason}` } });
      expect(db.paymentWebhookEvent.rows.find((e) => e.id === id)?.event).toBe(`order.paid:rejected:${reason}`);
    }
    expect(order('m1')).toMatchObject({ status: 'PENDING', hikieOrderId: null });
    expect(user('u1').credits).toBe(0);
    expect(db.creditTransaction.rows).toHaveLength(0);
  });

  it('premium paketi order.paid ile premiumUntil = max(şimdi, mevcut) + 30 gün; 0 tutarlı PURCHASE satırı', async () => {
    const future = new Date(NOW + 10 * DAY);
    await seedUser('u1', { premiumUntil: future });
    await seedOrder('p1', 'premium_30d');
    const body = paidBody('p1', 'inv_p1', '99.99');
    await handleHikieWebhook(paidHeaders(body), body, ENV, NOW);
    expect((user('u1').premiumUntil as Date).getTime()).toBe(future.getTime() + 30 * DAY);
    expect(db.creditTransaction.rows).toEqual([expect.objectContaining({ type: 'PURCHASE', amount: 0 })]);
  });

  it('parseHikieWebhook: yük biçimi tek yerde (data / kök, virgüllü tutar)', () => {
    const p = parseHikieWebhook({ 'hikie-event': 'order.paid' }, { merchantOrderId: 'm', orderId: 'o', amount: '39,99' });
    expect(p).toMatchObject({ event: 'order.paid', merchantOrderId: 'm', hikieOrderId: 'o', amountKurus: 3999 });
  });
});
