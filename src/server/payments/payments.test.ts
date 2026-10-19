import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bellek içi sahte DB (gerçek DB / gerçek Hikie yok).
vi.mock('@/lib/prisma', async () => {
  const { createFakePaymentDb } = await import('@/test/fakePaymentDb');
  return { prisma: createFakePaymentDb() };
});

const mail = vi.hoisted(() => ({ send: vi.fn(async (..._a: unknown[]) => true), capture: vi.fn() }));
vi.mock('@/lib/security', async (orig) => ({ ...(await orig<typeof import('@/lib/security')>()), sendTransactionalEmail: mail.send }));
vi.mock('@/lib/logger', async (orig) => ({ ...(await orig<typeof import('@/lib/logger')>()), captureError: mail.capture }));

import { prisma } from '@/lib/prisma';
import { PURCHASE_TERMS_VERSION } from '@/config/legalConsent';
import type { FakePaymentDb } from '@/test/fakePaymentDb';
import { availablePackageKeys, checkoutUrl, findPaymentPackage, paymentsEnabled } from '@/config/paymentPackages';
import { hmacHex, signatureMatches, timestampFresh, verifyWebhookSignature } from './hikieSignature';
import { CheckoutError, createCheckout, getOrderStatusForUser, handleHikieCallback, handleHikieWebhook, parseHikieWebhook, refundOrder, tlTextToKurus } from './paymentOrders';

const db = prisma as unknown as FakePaymentDb;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const ENV = {
  PAYMENTS_ENABLED: 'true',
  HIKIE_LINK_CREDITS_10: 'https://pay.hikie.example/l/c10?ref=oy',
  HIKIE_LINK_CREDITS_30: 'https://pay.hikie.example/l/c30',
  HIKIE_LINK_PREMIUM_30D: 'https://pay.hikie.example/l/p30',
  HIKIE_LINK_TEST_1TL: 'https://pay.hikie.example/l/t1',
  HIKIE_WEBHOOK_SECRET: 'whsec',
};
const PRICE: Record<string, string> = { credits_10: '39.99', credits_30: '99.99', premium_30d: '99.99', test_1tl: '1.00' };
const ts = (ms = NOW) => String(Math.floor(ms / 1000));
/** Geçerli satın alma onayı (istemcinin gönderdiği). */
const TERMS = { accepted: true, version: PURCHASE_TERMS_VERSION };

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
  mail.send.mockReset();
  mail.send.mockResolvedValue(true);
  mail.capture.mockReset();
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
    // Premium kaldırıldı: env'de HIKIE_LINK_PREMIUM_30D olsa da katalogda yok, satışa açılmaz.
    expect(findPaymentPackage('premium_30d')).toBeNull();
    expect(findPaymentPackage('premium_365d')).toBeNull();
    expect(findPaymentPackage('test_1tl')).toMatchObject({ credits: 1, priceKurus: 100, adminOnly: true });
    expect(findPaymentPackage('yok')).toBeNull();
    expect(availablePackageKeys(ENV)).toEqual(['credits_10', 'credits_30', 'test_1tl']);
    expect(availablePackageKeys({ PAYMENTS_ENABLED: 'true', HIKIE_LINK_CREDITS_10: 'http://x', HIKIE_WEBHOOK_SECRET: 'w' })).toEqual([]);
    // webhook secret yoksa hiçbir paket satışta değil (link tek başına yetmez); paket başına secret artık gerekmez
    expect(availablePackageKeys({ PAYMENTS_ENABLED: 'true', HIKIE_LINK_CREDITS_10: 'https://p.example/l/x' })).toEqual([]);
    expect(availablePackageKeys({ PAYMENTS_ENABLED: 'true', HIKIE_LINK_CREDITS_10: 'https://p.example/l/x', HIKIE_WEBHOOK_SECRET: 'w' })).toEqual(['credits_10']);
    expect(checkoutUrl('https://p.example/l/x?ref=oy', 'oy_1')).toBe('https://p.example/l/x?ref=oy&merchantOrderId=oy_1');
  });
});

describe('PAYMENTS_ENABLED (ana ödeme anahtarı, varsayılan kapalı)', () => {
  const LINKS = { ...ENV, PAYMENTS_ENABLED: undefined };

  it.each([undefined, '', 'false', '1', 'TRUE', 'yes'])('PAYMENTS_ENABLED=%s → link + secret olsa da hiçbir paket satışta değil', (v) => {
    expect(paymentsEnabled({ ...LINKS, PAYMENTS_ENABLED: v })).toBe(false);
    expect(availablePackageKeys({ ...LINKS, PAYMENTS_ENABLED: v })).toEqual([]);
  });

  it('" true " (boşluklu) açar', () => {
    expect(paymentsEnabled({ PAYMENTS_ENABLED: ' true ' })).toBe(true);
  });

  it('kapalıyken checkout 409 UNAVAILABLE, sipariş açılmaz (yönetici test paketi dahil)', async () => {
    await seedUser('u1');
    await seedUser('a1', { role: 'ADMIN' });
    await expect(createCheckout('u1', 'credits_10', TERMS, LINKS)).rejects.toMatchObject({ status: 409, code: 'UNAVAILABLE' });
    await expect(createCheckout('a1', 'test_1tl', TERMS, LINKS)).rejects.toMatchObject({ status: 409, code: 'UNAVAILABLE' });
    expect(db.paymentOrder.rows).toHaveLength(0);
  });
});

describe('checkout', () => {
  it('PENDING sipariş + linke merchantOrderId; tutar paketten', async () => {
    await seedUser('u1');
    const r = await createCheckout('u1', 'credits_10', TERMS, ENV, NOW);
    expect(r.url).toBe(`https://pay.hikie.example/l/c10?ref=oy&merchantOrderId=${r.merchantOrderId}`);
    expect(order(r.merchantOrderId)).toMatchObject({ userId: 'u1', packageKey: 'credits_10', amountTRY: '39.99', status: 'PENDING' });
    // Onay kaydı: SUNUCUNUN sürümü ve zamanı; dil yoksa tr
    expect(order(r.merchantOrderId)).toMatchObject({ termsAcceptedAt: new Date(NOW), termsVersion: PURCHASE_TERMS_VERSION, locale: 'tr' });
    const en = await createCheckout('u1', 'credits_10', { ...TERMS, locale: 'en' }, ENV, NOW);
    expect(order(en.merchantOrderId).locale).toBe('en');
  });

  it('satın alma onayı yoksa 400 PURCHASE_TERMS_REQUIRED, eski sürüm 409 PURCHASE_TERMS_OUTDATED; sipariş açılmaz', async () => {
    await seedUser('u1');
    const bad: Record<string, unknown>[] = [
      {},
      { accepted: false, version: PURCHASE_TERMS_VERSION },
      { accepted: 'true', version: PURCHASE_TERMS_VERSION },
      { accepted: 1, version: PURCHASE_TERMS_VERSION },
      { accepted: true },
      { accepted: true, version: '' },
      { accepted: true, version: 5 },
    ];
    for (const t of bad) {
      await expect(createCheckout('u1', 'credits_10', t, ENV)).rejects.toMatchObject({ status: 400, code: 'PURCHASE_TERMS_REQUIRED' });
    }
    await expect(createCheckout('u1', 'credits_10', { accepted: true, version: '2000-01-01' }, ENV)).rejects.toMatchObject({
      status: 409,
      code: 'PURCHASE_TERMS_OUTDATED',
    });
    // Onaysız istek, satış kapalıyken de önce onay hatası alır (kapı sırası)
    await expect(createCheckout('u1', 'credits_10', {}, { ...ENV, PAYMENTS_ENABLED: undefined })).rejects.toMatchObject({ code: 'PURCHASE_TERMS_REQUIRED' });
    expect(db.paymentOrder.rows).toHaveLength(0);
  });

  it('bilinmeyen paket 400; env eksik paket 409; test paketi yalnız ADMIN', async () => {
    await seedUser('u1');
    await seedUser('a1', { role: 'ADMIN' });
    await expect(createCheckout('u1', 'yok', TERMS, ENV)).rejects.toMatchObject({ status: 400 });
    await expect(createCheckout('u1', 'credits_100', TERMS, ENV)).rejects.toMatchObject({ status: 409, code: 'UNAVAILABLE' });
    await expect(createCheckout('u1', 'test_1tl', TERMS, ENV)).rejects.toBeInstanceOf(CheckoutError);
    expect(db.paymentOrder.rows).toHaveLength(0);
    // webhook secret yoksa link olsa bile satışta değil
    await expect(createCheckout('a1', 'test_1tl', TERMS, { ...ENV, HIKIE_WEBHOOK_SECRET: '' })).rejects.toMatchObject({ status: 409 });
    const ok = await createCheckout('a1', 'test_1tl', TERMS, ENV);
    expect(order(ok.merchantOrderId).amountTRY).toBe('1.00');
  });
});

const M1 = `oy_${'a'.repeat(32)}`;

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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let i = 0;
    for (const [body, reason] of cases) {
      const id = `rej_${++i}`;
      expect(await send(body, id)).toEqual({ status: 200, body: { ok: true, result: `rejected:${reason}` } });
      expect(db.paymentWebhookEvent.rows.find((e) => e.id === id)?.event).toBe(`order.paid:rejected:${reason}`);
    }
    // Log: orderId, merchantOrderId, gelen / beklenen kuruş, neden; kişisel veri yok
    const lines = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(lines).toHaveLength(cases.length);
    expect(lines[0]).toContain('neden=amount_mismatch orderId=ord_1 merchantOrderId=m1 gelenKurus=100 beklenenKurus=3999 currency=TRY status=COMPLETED');
    expect(lines[2]).toContain('neden=no_merchant_order_id orderId=ord_1 merchantOrderId=- gelenKurus=3999 beklenenKurus=-');
    expect(lines[6]).toContain('neden=unknown_order orderId=ord_1 merchantOrderId=yok');
    expect(lines.join('\n')).not.toMatch(/@|whsec|signature/i);
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

  it('eski premium siparişi (katalogda yok) order.paid → 200 rejected:unknown_package; premiumUntil / kredi değişmez', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await seedUser('u1', { premiumUntil: null });
    await seedOrder('p1', 'premium_30d');
    expect(await send(direct('p1', '99.99'))).toEqual({ status: 200, body: { ok: true, result: 'rejected:unknown_package' } });
    warn.mockRestore();
    expect(user('u1')).toMatchObject({ premiumUntil: null, credits: 0 });
    expect(order('p1').status).toBe('PENDING');
    expect(db.creditTransaction.rows).toHaveLength(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refundOrder: katalogda olmayan eski paket → REFUNDED, bakiyeye dokunulmaz', async () => {
    await seedUser('u1', { credits: 5 });
    await seedOrder('p1', 'premium_30d', 'u1', 'PAID');
    expect(await refundOrder(order('p1').id as string, NOW)).toEqual({ result: 'refunded', shortfall: 0, unknownPackage: true });
    expect(order('p1').status).toBe('REFUNDED');
    expect(user('u1').credits).toBe(5);
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

describe('sipariş onay e-postası (order.paid sonrası, bir kez)', () => {
  const sign = (body: string, id: string) => ({
    'hikie-event': 'order.paid',
    'hikie-webhook-id': id,
    'hikie-timestamp': ts(),
    'hikie-signature': hmacHex('whsec', `${ts()}.${body}`),
  });
  const body = (m: string, total = '39.99', orderId = 'ord_1') =>
    JSON.stringify({ orderId, status: 'COMPLETED', currency: 'TRY', totals: { total }, merchantOrderId: m });
  const send = (b: string, id: string) => handleHikieWebhook(sign(b, id), b, ENV, NOW);

  async function seed(locale: string | null = 'tr', email = 'ali@example.com') {
    await seedUser('u1', { email });
    await db.paymentOrder.create({ data: { merchantOrderId: 'm1', userId: 'u1', packageKey: 'credits_30', amountTRY: '99.99', status: 'PENDING', locale } });
  }

  it('PAID olunca bir kez gönderilir: sipariş no, paket, kredi, KDV dahil tutar, tarih, satıcı, iletişim', async () => {
    await seed();
    expect(await send(body('m1', '99.99'), 'w1')).toEqual({ status: 200, body: { ok: true, result: 'fulfilled' } });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const [to, content] = mail.send.mock.calls[0] as [string, { subject: string; text: string; html: string }];
    expect(to).toBe('ali@example.com');
    expect(content.subject).toContain('Sipariş onayı (m1)');
    expect(content.text).toContain('Sipariş numarası: m1');
    expect(content.text).toContain('Paket: 30 AI analiz kredisi');
    expect(content.text).toContain('Yüklenen kredi: 30');
    expect(content.text).toContain('Tutar (KDV dahil): 99,99 TL');
    expect(content.text).toMatch(/Tarih: 5 Ekim 2026 15:00 \(TSİ\)/);
    expect(content.text).toContain('Satıcı: Scor3 · Web sitesi: ');
    expect(content.text).toContain('info@');
    expect(content.html).toContain('<html lang="tr">');
    expect(order('m1').confirmationEmailSentAt).toBeInstanceOf(Date);
  });

  it('çift webhook (aynı ve farklı Hikie-Webhook-Id) tekrar göndermez', async () => {
    await seed();
    await send(body('m1', '99.99'), 'w1');
    await send(body('m1', '99.99'), 'w1');
    await send(body('m1', '99.99'), 'w2');
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(user('u1').credits).toBe(30);
  });

  it('e-posta hatası (false ya da istisna): webhook yine 200, kredi verilir, hata Sentry\'ye, talep geri alınır', async () => {
    await seed();
    mail.send.mockResolvedValueOnce(false);
    expect(await send(body('m1', '99.99'), 'w1')).toEqual({ status: 200, body: { ok: true, result: 'fulfilled' } });
    expect(user('u1').credits).toBe(30);
    expect(order('m1').status).toBe('PAID');
    expect(mail.capture).toHaveBeenCalledWith('payment-confirmation-email', expect.any(Error));
    expect(order('m1').confirmationEmailSentAt).toBeNull();

    // Ağ hatası da aynı: yanıt 200, kredi değişmez
    db.reset();
    await seed();
    mail.send.mockRejectedValueOnce(new Error('ağ'));
    expect((await send(body('m1', '99.99'), 'w9')).status).toBe(200);
    expect(user('u1').credits).toBe(30);
    expect(mail.capture).toHaveBeenCalledTimes(2);
  });

  it('İngilizce sipariş EN şablonu; silinmiş kullanıcı adresine gönderilmez', async () => {
    await seed('en');
    await send(body('m1', '99.99'), 'w1');
    const [, content] = mail.send.mock.calls[0] as [string, { subject: string; text: string; html: string }];
    expect(content.subject).toContain('Order confirmation (m1)');
    expect(content.text).toContain('Amount (VAT included): 99.99 TRY');
    expect(content.html).toContain('<html lang="en">');

    db.reset();
    mail.send.mockClear();
    await seed('tr', 'deleted-user@deleted.invalid');
    await send(body('m1', '99.99'), 'w2');
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('reddedilen ödeme (yanlış tutar) e-posta göndermez', async () => {
    await seed();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await send(body('m1', '1.00'), 'w1');
    warn.mockRestore();
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('sonuç sayfası sipariş durumu (yalnız kendi siparişi)', () => {
  const M = (c: string) => `oy_${c.repeat(32)}`;
  async function mk(m: string, userId: string, status: string, createdAgoMs: number, paidAgoMs: number | null = null) {
    await db.paymentOrder.create({
      data: {
        merchantOrderId: m,
        userId,
        packageKey: 'credits_10',
        amountTRY: '39.99',
        status,
        createdAt: new Date(NOW - createdAgoMs),
        paidAt: paidAgoMs == null ? null : new Date(NOW - paidAgoMs),
      },
    });
  }

  it('kimlik verilmezse (başka cihaz / Hikie doğrudan dönüşü) son 30 dk\'da ödenen sipariş; yoksa son 24 sa en yeni', async () => {
    await seedUser('u1', { credits: 12 });
    await mk(M('a'), 'u1', 'PAID', 20 * 60_000, 10 * 60_000);
    await mk(M('b'), 'u1', 'PENDING', 60_000); // sonradan açılıp yarım bırakılan
    expect(await getOrderStatusForUser('u1', null, NOW)).toMatchObject({ merchantOrderId: M('a'), status: 'PAID', packageCredits: 10, credits: 12 });
    // 30 dk'dan eski ödeme öne alınmaz → en yeni sipariş
    db.paymentOrder.rows.find((r) => r.merchantOrderId === M('a'))!.paidAt = new Date(NOW - 31 * 60_000);
    expect(await getOrderStatusForUser('u1', null, NOW)).toMatchObject({ merchantOrderId: M('b'), status: 'PENDING' });
  });

  it('tarayıcıdaki kimlik PENDING ama ödeme başka siparişle tamamlandıysa ödenen gösterilir', async () => {
    await seedUser('u1');
    await mk(M('a'), 'u1', 'PENDING', 15 * 60_000);
    await mk(M('b'), 'u1', 'PAID', 5 * 60_000, 2 * 60_000);
    expect(await getOrderStatusForUser('u1', M('a'), NOW)).toMatchObject({ merchantOrderId: M('b'), status: 'PAID' });
  });

  it('bekleyen YENİ siparişin yerine daha önceki ödeme "ödendi" diye gösterilmez (30 dk içinde iki satın alma)', async () => {
    await seedUser('u1');
    await mk(M('a'), 'u1', 'PAID', 20 * 60_000, 15 * 60_000); // ilk satın alma
    await mk(M('b'), 'u1', 'PENDING', 2 * 60_000); // ikinci, henüz onaylanmadı
    expect(await getOrderStatusForUser('u1', M('b'), NOW)).toMatchObject({ merchantOrderId: M('b'), status: 'PENDING' });
  });

  it('yetkisiz erişim yok: başkasının sipariş kimliği null; başkasının ödenmiş siparişi asla dönmez', async () => {
    await seedUser('u1');
    await seedUser('u2');
    await mk(M('a'), 'u1', 'PAID', 5 * 60_000, 60_000);
    expect(await getOrderStatusForUser('u2', M('a'), NOW)).toBeNull();
    expect(await getOrderStatusForUser('u2', null, NOW)).toBeNull();
    await mk(M('c'), 'u2', 'PENDING', 60_000);
    expect(await getOrderStatusForUser('u2', M('c'), NOW)).toMatchObject({ merchantOrderId: M('c'), status: 'PENDING' });
  });
});
