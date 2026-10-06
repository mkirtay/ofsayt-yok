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
import { CheckoutError, createCheckout, handleHikieCallback, handleHikieWebhook, parseHikieWebhook, refundOrder, tlTextToKurus } from './paymentOrders';

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

describe('webhook (Hikie sözleşmesi)', () => {
  const sign = (body: string, t = ts(), id = 'wh_1', event = 'order.paid') => ({
    'hikie-event': event,
    'hikie-webhook-id': id,
    'hikie-timestamp': t,
    'hikie-signature': hmacHex('whsec', `${t}.${body}`),
    'hikie-delivery-attempt': '1',
  });
  /** Doğrudan sipariş nesnesi (zarfsız). */
  const orderObj = (merchantOrderId: string | null, total: string, extra: Record<string, unknown> = {}) => ({
    orderId: 'ord_1',
    status: 'COMPLETED',
    currency: 'TRY',
    totals: { total },
    merchantOrderId,
    isLink: true,
    linkId: 'lnk_1',
    ...extra,
  });
  const direct = (...a: Parameters<typeof orderObj>) => JSON.stringify(orderObj(...a));
  const envelope = (...a: Parameters<typeof orderObj>) => JSON.stringify({ id: 'evt_1', event: 'order.paid', data: orderObj(...a) });
  const send = (body: string, id = 'wh_1', event = 'order.paid') => handleHikieWebhook(sign(body, ts(), id, event), body, ENV, NOW);

  async function paid(credits: number, packageKey = 'credits_10') {
    await seedUser('u1', { credits });
    await seedOrder('m1', packageKey);
    await send(direct('m1', PRICE[packageKey]!), 'wh_paid');
  }

  it('tlTextToKurus: metin üzerinden, float yok; bozuk biçim null', () => {
    expect(tlTextToKurus('249.90')).toBe(24990);
    expect(tlTextToKurus('249')).toBe(24900);
    expect(tlTextToKurus('0.5')).toBe(50);
    expect(tlTextToKurus('39.99')).toBe(3999);
    for (const bad of ['', '1,5', '1.234', '-1', 'abc', 12.5, null, undefined]) expect(tlTextToKurus(bad)).toBeNull();
  });

  it('order.paid: zarfsız ve zarflı gövde → kredi bir kez; olay tipi başlıktan', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    await seedOrder('m2', 'credits_10');
    expect((await send(direct('m1', '39.99'), 'a')).body.result).toBe('fulfilled');
    const env2 = JSON.stringify({ id: 'evt_2', event: 'order.paid', data: { ...orderObj('m2', '39.99'), orderId: 'ord_2' } });
    expect((await send(env2, 'b')).body.result).toBe('fulfilled');
    expect(order('m1')).toMatchObject({ status: 'PAID', hikieOrderId: 'ord_1' });
    expect(order('m2')).toMatchObject({ status: 'PAID', hikieOrderId: 'ord_2' });
    expect(user('u1').credits).toBe(20);
    // başlık esas: gövdede event yok / başka, başlıkta order.paid → yine işlenir
    expect(parseHikieWebhook({ 'hikie-event': 'order.paid' }, { event: 'order.updated', ...orderObj('m', '1.00') }).event).toBe('order.paid');
    expect(parseHikieWebhook({}, JSON.parse(envelope('m', '1.00'))).event).toBe('order.paid');
  });

  it('tekrar gönderim: aynı Hikie-Webhook-Id ve aynı orderId farklı kimlikle → kredi bir kez, 200', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const body = direct('m1', '39.99');
    expect(await send(body, 'a')).toEqual({ status: 200, body: { ok: true, result: 'fulfilled' } });
    expect((await send(body, 'a')).body.result).toBe('duplicate');
    expect((await send(body, 'b')).body.result).toBe('duplicate');
    expect(user('u1').credits).toBe(10);
    expect(db.creditTransaction.rows).toHaveLength(1);
  });

  it('aynı Hikie orderId başka siparişe yazılmaz', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    await seedOrder('m2', 'credits_10');
    await send(direct('m1', '39.99'), 'a');
    expect((await send(direct('m2', '39.99'), 'b')).body.result).toBe('duplicate');
    expect(order('m2').status).toBe('PENDING');
    expect(user('u1').credits).toBe(10);
  });

  it('iş kuralı reddi 200 + kredi yok + kayıt: yanlış tutar, merchantOrderId null, status, para birimi, bilinmeyen sipariş', async () => {
    await seedUser('u1');
    await seedOrder('m1', 'credits_10');
    const cases: [string, string][] = [
      [direct('m1', '1.00'), 'amount_mismatch'],
      [direct('m1', '39.9'), 'amount_mismatch'],
      [direct(null, '39.99'), 'no_merchant_order_id'],
      [direct('m1', '39.99', { status: 'PENDING' }), 'status_mismatch'],
      [direct('m1', '39.99', { currency: 'USD' }), 'currency_mismatch'],
      [direct('m1', '39.99', { currency: undefined }), 'currency_mismatch'],
      [direct('yok', '39.99'), 'unknown_order'],
      [JSON.stringify({ ...orderObj('m1', '39.99'), totals: {} }), 'amount_missing'],
      [JSON.stringify({ ...orderObj('m1', '39.99'), orderId: undefined }), 'missing_order_id'],
    ];
    let i = 0;
    for (const [body, reason] of cases) {
      const id = `rej_${++i}`;
      expect(await send(body, id)).toEqual({ status: 200, body: { ok: true, result: `rejected:${reason}` } });
      expect(db.paymentWebhookEvent.rows.find((e) => e.id === id)?.event).toBe(`order.paid:rejected:${reason}`);
    }
    expect(order('m1')).toMatchObject({ status: 'PENDING', hikieOrderId: null });
    expect(user('u1').credits).toBe(0);
    expect(db.creditTransaction.rows).toHaveLength(0);
  });

  it('400: imza yanlış / başlık eksik / eski zaman damgası / çözümlenemeyen gövde; 503: secret yok', async () => {
    const body = direct('m1', '39.99');
    expect((await handleHikieWebhook({ ...sign(body), 'hikie-signature': hmacHex('baska', 'x') }, body, ENV, NOW)).status).toBe(400);
    expect((await handleHikieWebhook(sign(body), body, { ...ENV, HIKIE_WEBHOOK_SECRET: 'baska' }, NOW)).status).toBe(400);
    expect((await handleHikieWebhook(sign(body), `${body} `, ENV, NOW)).status).toBe(400); // ham gövde değişti
    const noSig = { ...sign(body) } as Record<string, string>;
    delete noSig['hikie-signature'];
    expect((await handleHikieWebhook(noSig, body, ENV, NOW)).status).toBe(400);
    expect((await handleHikieWebhook(sign(body, ts(NOW - 10 * 60_000)), body, ENV, NOW)).status).toBe(400);
    const bad = 'not json';
    expect(await handleHikieWebhook(sign(bad), bad, ENV, NOW)).toEqual({ status: 400, body: { error: 'bad_json' } });
    expect((await handleHikieWebhook(sign(body), body, { ...ENV, HIKIE_WEBHOOK_SECRET: '' }, NOW)).status).toBe(503);
    expect(db.creditTransaction.rows).toHaveLength(0);
  });

  it('test.ping, tanınmayan olay, order.shipmentUpdated → 200 yok sayılır', async () => {
    for (const [i, ev] of ['test.ping', 'order.shipmentUpdated', 'baska.olay'].entries()) {
      const body = JSON.stringify({ id: `e${i}`, event: ev });
      expect(await send(body, `p${i}`, ev)).toEqual({ status: 200, body: { ok: true, result: 'ignored' } });
    }
  });

  it('order.updated REFUNDED / CANCELLED: yalnız log, kredi geri alınmaz, sipariş PAID kalır', async () => {
    await paid(2);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [i, st] of ['REFUNDED', 'CANCELLED'].entries()) {
      const body = JSON.stringify({ id: `u${i}`, event: 'order.updated', data: orderObj('m1', '39.99', { status: st }) });
      expect((await send(body, `up${i}`, 'order.updated')).body.result).toBe('logged');
    }
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    expect(order('m1').status).toBe('PAID');
    expect(user('u1').credits).toBe(12);
  });

  it('premium paketi order.paid ile premiumUntil = max(şimdi, mevcut) + 30 gün; 0 tutarlı PURCHASE satırı', async () => {
    const future = new Date(NOW + 10 * DAY);
    await seedUser('u1', { premiumUntil: future });
    await seedOrder('p1', 'premium_30d');
    await send(direct('p1', '99.99'));
    expect((user('u1').premiumUntil as Date).getTime()).toBe(future.getTime() + 30 * DAY);
    expect(db.creditTransaction.rows).toEqual([expect.objectContaining({ type: 'PURCHASE', amount: 0 })]);
  });

  it('refundOrder (elle / ileride): bakiye yetmezse 0\'a kadar geri alınır, eksik not edilir', async () => {
    await paid(0); // 10
    await db.user.update({ where: { id: 'u1' }, data: { credits: 4 } });
    const r = await refundOrder(order('m1').id as string, NOW);
    expect(r).toEqual({ result: 'refunded', shortfall: 6 });
    expect(user('u1').credits).toBe(0);
    const row = db.creditTransaction.rows.find((x) => x.type === 'REFUND')!;
    expect(row).toMatchObject({ amount: -4, balanceAfter: 0 });
    expect(row.note).toContain('6 kredi alınamadı');
  });
});
