/**
 * Hikie ödeme siparişleri (v1) — checkout, callback, webhook, iade.
 *
 * Kural: kredi kararı YALNIZ imzalı `order.paid` webhook'undan (whsec_ secret) verilir; üstelik sipariş
 * eşleşmesi (merchantOrderId), status, para birimi ve tutar doğrulanır. Checkout Link callback'i (GET) imzasızdır: yalnız `callbackAt` işaretler ve
 * sonuç sayfasına yönlendirir, status / isSuccess hiçbir kredi kararında kullanılmaz. /odeme/tamamlandi yalnız
 * durumu okur (PAID olana kadar yoklar).
 *
 * İdempotentlik: sipariş durumu koşullu güncellenir (PENDING/FAILED → PAID yalnız bir kez), `hikieOrderId` tekil,
 * kredi defteri satırının tekrar anahtarı `hikie:{hikieOrderId}` (kullanıcı başına tekil). Aynı ödeme için ikinci
 * webhook hiçbir şey yapmadan 200 alır.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/credits';
import {
  findPaymentPackage,
  packageLink,
  paymentsEnabled,
  webhookSecret,
  checkoutUrl,
  kurusToTryString,
  type PaymentPackage,
} from '@/config/paymentPackages';
import { PURCHASE_TERMS_VERSION } from '@/config/legalConsent';
import { captureError } from '@/lib/logger';
import { timestampFresh, verifyWebhookSignature } from './hikieSignature';
import { sendOrderConfirmationOnce } from './orderConfirmationEmail';

type Env = Record<string, string | undefined>;
type Tx = Prisma.TransactionClient;

export type HandlerResult = { status: number; body: Record<string, unknown> };

const DAY_MS = 86_400_000;
const OPTIMISTIC_RETRIES = 5;

export function newMerchantOrderId(): string {
  return `oy_${randomUUID().replace(/-/g, '')}`;
}

function packageNote(pkg: PaymentPackage): string {
  return `${pkg.credits} kredi (${pkg.key})`;
}

// ── Checkout ──────────────────────────────────────────────────────────────────────────────────────────

export class CheckoutError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'UNKNOWN_PACKAGE' | 'UNAVAILABLE' | 'PURCHASE_TERMS_REQUIRED' | 'PURCHASE_TERMS_OUTDATED',
  ) {
    super(code);
    this.name = 'CheckoutError';
  }
}

/** Satın alma onayı (istemciden): `accepted` yalnız JSON `true`; `version` istemcinin gösterdiği metin sürümü. */
export type PurchaseTerms = { accepted?: unknown; version?: unknown; locale?: unknown };

/**
 * PENDING sipariş oluşturur, paketin Checkout Link'ine `merchantOrderId` ekleyip döner. Yönetici paketi yalnız
 * ADMIN'e görünür (diğerlerine bilinmeyen paket). PAYMENTS_ENABLED kapalıysa ya da paket linki / webhook secret'ı
 * tanımlı değilse satışta değil.
 *
 * Satın alma onayı ZORUNLU (Ön Bilgilendirme + Mesafeli Satış + anında ifa / cayma hakkı beyanı): `accepted === true`
 * ve sürüm yoksa 400 PURCHASE_TERMS_REQUIRED; sürüm güncel değilse (eski sekme) 409 PURCHASE_TERMS_OUTDATED. Kayda
 * istemcinin değil SUNUCUNUN sürümü ve zamanı yazılır (termsAcceptedAt / termsVersion).
 */
export async function createCheckout(
  userId: string,
  packageKey: unknown,
  terms: PurchaseTerms = {},
  env: Env = process.env,
  now: number = Date.now(),
): Promise<{ url: string; merchantOrderId: string }> {
  const pkg = findPaymentPackage(packageKey);
  if (!pkg) throw new CheckoutError(400, 'UNKNOWN_PACKAGE');
  if (terms.accepted !== true || typeof terms.version !== 'string' || !terms.version) {
    throw new CheckoutError(400, 'PURCHASE_TERMS_REQUIRED');
  }
  if (terms.version !== PURCHASE_TERMS_VERSION) throw new CheckoutError(409, 'PURCHASE_TERMS_OUTDATED');
  if (pkg.adminOnly) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new CheckoutError(400, 'UNKNOWN_PACKAGE');
  }
  const link = packageLink(pkg.key, env);
  if (!paymentsEnabled(env) || !link || !webhookSecret(env)) throw new CheckoutError(409, 'UNAVAILABLE');
  const merchantOrderId = newMerchantOrderId();
  await prisma.paymentOrder.create({
    data: {
      merchantOrderId,
      userId,
      packageKey: pkg.key,
      amountTRY: kurusToTryString(pkg.priceKurus),
      status: 'PENDING',
      termsAcceptedAt: new Date(now),
      termsVersion: PURCHASE_TERMS_VERSION,
      locale: terms.locale === 'en' ? 'en' : 'tr',
    },
  });
  return { url: checkoutUrl(link, merchantOrderId), merchantOrderId };
}

// ── Ödeme tamamlama / başarısız / iade ────────────────────────────────────────────────────────────────

/** Bakiyeden en çok `amount` kredi düşer (0'ın altına inmez). @returns düşülen miktar ve kalan bakiye */
async function takeCreditsUpTo(tx: Tx, userId: string, amount: number): Promise<{ taken: number; balanceAfter: number }> {
  for (let i = 0; i < OPTIMISTIC_RETRIES; i++) {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!u) throw new Error('Kullanıcı bulunamadı');
    const taken = Math.min(Math.max(0, u.credits), amount);
    if (taken === 0) return { taken: 0, balanceAfter: u.credits };
    const { count } = await tx.user.updateMany({ where: { id: userId, credits: u.credits }, data: { credits: u.credits - taken } });
    if (count === 1) return { taken, balanceAfter: u.credits - taken };
  }
  throw new Error('Kredi geri alınamadı (eşzamanlı değişiklik)');
}

export type FulfillResult = 'fulfilled' | 'duplicate' | 'missing';

/**
 * Ödeme başarılı: tek işlemde sipariş PAID + hikieOrderId, kredi eklenir (PURCHASE, tekrar anahtarı
 * `hikie:{hikieOrderId}`).
 * Sipariş zaten işlenmişse / bu Hikie ödemesi başka siparişe yazılmışsa 'duplicate' (hiçbir şey değişmez).
 */
export async function fulfillOrder(orderId: string, hikieOrderId: string, now: number = Date.now()): Promise<FulfillResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({ where: { id: orderId } });
      if (!order) return 'missing';
      if (order.status === 'PAID' || order.status === 'REFUNDED') return 'duplicate';
      const other = await tx.paymentOrder.findUnique({ where: { hikieOrderId }, select: { id: true } });
      if (other && other.id !== order.id) return 'duplicate';
      const pkg = findPaymentPackage(order.packageKey);
      if (!pkg) throw new Error(`Bilinmeyen paket: ${order.packageKey}`);
      // Koşullu geçiş: eşzamanlı ikinci istek satır kilidinden sonra koşulu yeniden değerlendirir → 0 satır.
      const { count } = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'PAID', hikieOrderId, paidAt: new Date(now) },
      });
      if (count === 0) return 'duplicate';
      const user = await tx.user.update({
        where: { id: order.userId },
        data: { credits: { increment: pkg.credits } },
        select: { credits: true },
      });
      await tx.creditTransaction.create({
        data: {
          userId: order.userId,
          type: 'PURCHASE',
          amount: pkg.credits,
          balanceAfter: user.credits,
          idempotencyKey: `hikie:${hikieOrderId}`,
          note: `Satın alma: ${packageNote(pkg)}`,
        },
      });
      return 'fulfilled';
    });
  } catch (err) {
    // Eşzamanlı ikinci istek tekil kısıta takıldı (hikieOrderId / tekrar anahtarı) → ilk istek işledi.
    if (isUniqueViolation(err)) return 'duplicate';
    throw err;
  }
}

export type RefundResult = { result: 'refunded' | 'noop'; shortfall?: number; unknownPackage?: boolean };

/**
 * İade / iptal: PAID → REFUNDED. Verilen kredi geri alınır — bakiye yetmezse 0'a kadar, eksik kalan not edilir
 * (credits ≥ 0 korunur). Bir kez.
 */
export async function refundOrder(orderId: string, now: number = Date.now()): Promise<RefundResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'PAID') return { result: 'noop' as const };
    const { count } = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: 'PAID' },
      data: { status: 'REFUNDED', refundedAt: new Date(now) },
    });
    if (count === 0) return { result: 'noop' as const };
    const pkg = findPaymentPackage(order.packageKey);
    // Katalogda olmayan eski paket (ör. kaldırılan premium_30d): sipariş REFUNDED olur, bakiyeye dokunulmaz (elle incele).
    if (!pkg) return { result: 'refunded' as const, shortfall: 0, unknownPackage: true };
    const { taken, balanceAfter } = await takeCreditsUpTo(tx, order.userId, pkg.credits);
    const shortfall = pkg.credits - taken;
    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        type: 'REFUND',
        amount: -taken,
        balanceAfter,
        idempotencyKey: `hikie-refund:${order.hikieOrderId ?? order.id}`,
        note:
          `İade: ${packageNote(pkg)}` +
          (shortfall > 0 ? ` — bakiye yetersiz: ${taken} kredi geri alındı, ${shortfall} kredi alınamadı` : ''),
      },
    });
    return { result: 'refunded' as const, shortfall };
  });
}

// ── Callback (GET) — İMZASIZ, kredi vermez ─────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null);

const MERCHANT_ORDER_RE = /^oy_[0-9a-f]{32}$/;

export type CallbackOutcome = { location: string };

/**
 * Hikie Checkout Link callback'i: yalnız `status, isSuccess, orderId, merchantOrderId` gelir, imza YOK. Bu yüzden
 * ASLA kredi vermez ve durumu değiştirmez; yalnız mevcut siparişe `callbackAt` yazar (tanılama) ve kullanıcıyı
 * sonuç sayfasına yönlendirir. Yönlendirme yeri yalnız arayüz içindir (status / isSuccess istemci tarafında güvenilmez
 * bilgi); gerçek sonuç /odeme/tamamlandi'da siparişin PAID olmasıyla (imzalı webhook) görünür.
 */
export async function handleHikieCallback(query: Record<string, unknown>, now: number = Date.now()): Promise<CallbackOutcome> {
  const merchantOrderId = str(query.merchantOrderId);
  const valid = merchantOrderId && MERCHANT_ORDER_RE.test(merchantOrderId) ? merchantOrderId : null;
  if (valid) {
    await prisma.paymentOrder.updateMany({ where: { merchantOrderId: valid, callbackAt: null }, data: { callbackAt: new Date(now) } });
  }
  const flag = (str(query.status) ?? '').toLowerCase();
  const failed = flag === 'failed' || flag === 'fail' || flag === 'cancelled' || flag === 'canceled';
  const target = failed ? '/odeme/tekrar-dene' : '/odeme/tamamlandi';
  return { location: valid && !failed ? `${target}?merchantOrderId=${valid}` : target };
}

// ── Webhook (POST) ────────────────────────────────────────────────────────────────────────────────────

const header = (h: Record<string, string | string[] | undefined>, name: string) => str(h[name.toLowerCase()]);

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** "249.90" / "249" / "0.5" → kuruş; yalnız nokta ondalıklı, en çok 2 hane, metin üzerinden (float yok). Aksi halde null. */
export function tlTextToKurus(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}

export type ParsedWebhook = {
  webhookId: string | null;
  timestamp: string | null;
  signature: string | null;
  /** Yalnız log. */
  attempt: string | null;
  /** Olay tipi: BAŞLIK esas (Hikie-Event); başlık yoksa zarfın `event` alanı. */
  event: string;
  orderId: string | null;
  /** string | null — null ise eşleştirme yok → kredi yok. */
  merchantOrderId: string | null;
  status: string;
  currency: string | null;
  /** totals.total (TL ondalık METİN) → kuruş; yoksa / bozuksa null → kredi yok. */
  totalKurus: number | null;
};

/**
 * Hikie webhook sözleşmesi (developer.hikie.space/tr/docs). Başlıklar: Hikie-Event, Hikie-Webhook-Id (tekrar anahtarı,
 * denemelerde değişmez), Hikie-Timestamp (Unix sn), Hikie-Signature (64 hex), Hikie-Delivery-Attempt. Gövde iki biçimde
 * gelebilir: doğrudan sipariş nesnesi ya da `{ id, event, ... }` zarfı (sipariş `data` / `order` altında) — ikisi de kabul
 * edilir. order.paid alanları: orderId, status (COMPLETED), currency (TRY), totals.total (TL ondalık metin),
 * merchantOrderId (string | null). Zarfın kendi `id`'si olay kimliğidir, sipariş kimliği DEĞİL (orderId yalnız `orderId`).
 */
export function parseHikieWebhook(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): ParsedWebhook {
  const order = [body.data, body.order].find(isObj) ?? body;
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    webhookId: header(headers, 'hikie-webhook-id'),
    timestamp: header(headers, 'hikie-timestamp'),
    signature: header(headers, 'hikie-signature'),
    attempt: header(headers, 'hikie-delivery-attempt'),
    event: header(headers, 'hikie-event') ?? text(body.event) ?? '',
    orderId: text(order.orderId),
    merchantOrderId: text(order.merchantOrderId),
    status: (text(order.status) ?? '').toUpperCase(),
    currency: text(order.currency)?.toUpperCase() ?? null,
    totalKurus: isObj(order.totals) ? tlTextToKurus(order.totals.total) : null,
  };
}

/**
 * `order.paid` doğrulaması: merchantOrderId ile eşleşen sipariş (null ise eşleştirme yok), status COMPLETED, para birimi
 * TRY, tutar siparişin kuruş tutarıyla birebir. Uyuşmazlıkta kredi yok (iş kuralı reddi).
 */
async function verifyPaidEvent(
  w: ParsedWebhook,
): Promise<{ ok: true; orderDbId: string; hikieOrderId: string } | { ok: false; reason: string; expectedKurus: number | null }> {
  const reject = (reason: string, expectedKurus: number | null = null) => ({ ok: false as const, reason, expectedKurus });
  if (!w.orderId) return reject('missing_order_id');
  if (!w.merchantOrderId) return reject('no_merchant_order_id');
  const order = await prisma.paymentOrder.findUnique({ where: { merchantOrderId: w.merchantOrderId } });
  if (!order) return reject('unknown_order');
  const expectedKurus = tlTextToKurus(order.amountTRY.toString());
  if (!findPaymentPackage(order.packageKey)) return reject('unknown_package', expectedKurus);
  if (w.status !== 'COMPLETED') return reject('status_mismatch', expectedKurus);
  if (w.currency !== 'TRY') return reject('currency_mismatch', expectedKurus);
  if (w.totalKurus == null) return reject('amount_missing', expectedKurus);
  if (w.totalKurus !== expectedKurus) return reject('amount_mismatch', expectedKurus);
  return { ok: true, orderDbId: order.id, hikieOrderId: w.orderId };
}

/**
 * İmzalı webhook. Yanıt kodları (Hikie kalıcı hatada aboneliği durdurur): imza yanlış / eski / başlık eksik / gövde
 * çözümlenemez → 400; HIKIE_WEBHOOK_SECRET yok → 503; (DB / geçici hata endpoint'te 503); başarı, tekrar, tanınmayan
 * olay, test.ping VE iş kuralı reddi (tutar / para birimi / status / sipariş) → 200 (+ log, 4xx yok).
 * order.paid → doğrula + fulfillOrder (idempotent: Hikie-Webhook-Id ve orderId) + sipariş onay e-postası (bir kez;
 * hatası yanıtı değiştirmez). order.updated REFUNDED / CANCELLED
 * şimdilik yalnız log (otomatik kredi geri alma yok). Diğer olaylar yok sayılır.
 */
export async function handleHikieWebhook(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<HandlerResult> {
  const secret = env.HIKIE_WEBHOOK_SECRET?.trim();
  if (!secret) return { status: 503, body: { error: 'webhook_disabled' } };

  const timestamp = header(headers, 'hikie-timestamp');
  const signature = header(headers, 'hikie-signature');
  if (!timestamp || !signature) return { status: 400, body: { error: 'missing_headers' } };
  if (!verifyWebhookSignature(secret, timestamp, rawBody, signature)) return { status: 400, body: { error: 'bad_signature' } };
  if (!timestampFresh(timestamp, now)) return { status: 400, body: { error: 'stale' } };

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!isObj(parsed)) throw new Error('not an object');
    body = parsed;
  } catch {
    return { status: 400, body: { error: 'bad_json' } };
  }
  const w = parseHikieWebhook(headers, body);
  if (!w.webhookId) return { status: 400, body: { error: 'missing_headers' } };

  if (await prisma.paymentWebhookEvent.findUnique({ where: { id: w.webhookId } })) {
    return { status: 200, body: { ok: true, result: 'duplicate' } };
  }

  let result = 'ignored';
  let recorded = w.event || 'unknown';
  if (w.event === 'order.paid') {
    const v = await verifyPaidEvent(w);
    if (v.ok) {
      result = await fulfillOrder(v.orderDbId, v.hikieOrderId, now);
      // Sipariş onay e-postası: sipariş PAID ise ve daha önce gönderilmediyse BİR KEZ (çift webhook / eşzamanlı teslimatta
      // tekrar yok). Hata kredi kararını ve yanıtı (200) ETKİLEMEZ; yalnız Sentry'ye yazılır.
      if (result === 'fulfilled' || result === 'duplicate') {
        try {
          await sendOrderConfirmationOnce(v.orderDbId);
        } catch (err) {
          captureError('payment-confirmation-email', err);
        }
      }
    } else {
      result = `rejected:${v.reason}`;
      recorded = `order.paid:rejected:${v.reason}`;
      // Reddedilen ama parası alınmış sipariş elle bulunup tamamlanabilsin: yalnız kimlikler, tutarlar (kuruş), status, para
      // birimi, neden. Kişisel veri (e-posta, adres, telefon) yok; imza / secret yok.
      console.warn(
        `[payments] order.paid reddedildi: neden=${v.reason} orderId=${w.orderId ?? '-'} merchantOrderId=${w.merchantOrderId ?? '-'} ` +
          `gelenKurus=${w.totalKurus ?? '-'} beklenenKurus=${v.expectedKurus ?? '-'} currency=${w.currency ?? '-'} status=${w.status || '-'} ` +
          `webhookId=${w.webhookId} deneme=${w.attempt ?? '-'}`,
      );
    }
  } else if (w.event === 'order.updated' && (w.status === 'REFUNDED' || w.status === 'CANCELLED')) {
    result = 'logged';
    console.warn(`[payments] order.updated ${w.status}: otomatik geri alma yok, elle incelenmeli (merchantOrderId=${w.merchantOrderId ?? '-'}, orderId=${w.orderId ?? '-'})`);
  }

  // İşlendikten sonra kaydedilir: kayıt başarısız olsa bile yeniden teslimat idempotent (durum koşulları).
  try {
    await prisma.paymentWebhookEvent.create({ data: { id: w.webhookId, event: recorded } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  return { status: 200, body: { ok: true, result } };
}

// ── Durum okuma (kullanıcı) ve yönetici listesi ───────────────────────────────────────────────────────

export type OrderStatusView = {
  merchantOrderId: string;
  packageKey: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  /** Paketin kredisi (katalogda yoksa null). */
  packageCredits: number | null;
  /** Kullanıcının güncel bakiyesi (DB). */
  credits: number;
};

/** Başka sekme / cihazda tamamlanan ödemenin sonuç sayfasında "ödendi" görünmesi için bakılan pencere. */
export const RECENT_PAID_WINDOW_MS = 30 * 60_000;

/**
 * Sonuç sayfası için kullanıcının siparişi — YALNIZ kendi siparişleri (her sorgu `userId` ile; başkasının
 * merchantOrderId'si 404 ile aynı sonucu verir). Hangi sipariş:
 * 1. `merchantOrderId` verildiyse o sipariş; ama o sipariş PAID değilse ve kullanıcının ONDAN SONRA açılıp son 30 dk'da
 *    ödenen başka bir siparişi varsa o gösterilir (ödeme başka sekmede / cihazda yeni bir siparişle tamamlanmış olabilir).
 *    Daha önceki bir ödeme, bekleyen yeni siparişin yerine "ödendi" diye gösterilmez.
 * 2. Verilmediyse (Hikie doğrudan dönüşü, sipariş kimliği adreste yok; başka tarayıcı): son 30 dk'da ödenen en yeni
 *    sipariş, yoksa son 24 saatte açılan en yeni sipariş.
 * Bakiye DB'den (yönlendirme parametresine güvenilmez).
 */
export async function getOrderStatusForUser(userId: string, merchantOrderId: string | null, now: number = Date.now()): Promise<OrderStatusView | null> {
  const recentPaid = (createdSince?: Date) =>
    prisma.paymentOrder.findFirst({
      where: {
        userId,
        status: 'PAID',
        paidAt: { gte: new Date(now - RECENT_PAID_WINDOW_MS) },
        ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
      },
      orderBy: { paidAt: 'desc' },
    });
  let order = merchantOrderId ? await prisma.paymentOrder.findFirst({ where: { merchantOrderId, userId } }) : null;
  if (merchantOrderId && order && order.status !== 'PAID') order = (await recentPaid(order.createdAt)) ?? order;
  if (!merchantOrderId) {
    order =
      (await recentPaid()) ??
      (await prisma.paymentOrder.findFirst({ where: { userId, createdAt: { gte: new Date(now - DAY_MS) } }, orderBy: { createdAt: 'desc' } }));
  }
  if (!order) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return {
    merchantOrderId: order.merchantOrderId,
    packageKey: order.packageKey,
    status: order.status,
    packageCredits: findPaymentPackage(order.packageKey)?.credits ?? null,
    credits: user?.credits ?? 0,
  };
}

export type AdminPaymentRow = {
  id: string;
  merchantOrderId: string;
  packageKey: string;
  amountTRY: string;
  status: string;
  hikieOrderId: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  user: { id: string; email: string; username: string | null };
};

export async function listRecentPayments(limit = 50): Promise<AdminPaymentRow[]> {
  const rows = await prisma.paymentOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(1, limit), 200),
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    merchantOrderId: r.merchantOrderId,
    packageKey: r.packageKey,
    amountTRY: r.amountTRY.toString(),
    status: r.status,
    hikieOrderId: r.hikieOrderId,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
    refundedAt: r.refundedAt?.toISOString() ?? null,
    user: r.user,
  }));
}
