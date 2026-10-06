/**
 * Hikie ödeme siparişleri (v1) — checkout, callback, webhook, iade.
 *
 * Kural: kredi / premium kararı YALNIZ imzalı `order.paid` webhook'undan (whsec_ secret) verilir; üstelik sipariş
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
  packageSecret,
  checkoutUrl,
  kurusToTryString,
  type PaymentPackage,
} from '@/config/paymentPackages';
import { timestampFresh, verifyWebhookSignature } from './hikieSignature';

type Env = Record<string, string | undefined>;
type Tx = Prisma.TransactionClient;

export type HandlerResult = { status: number; body: Record<string, unknown> };

const DAY_MS = 86_400_000;
const OPTIMISTIC_RETRIES = 5;

export function newMerchantOrderId(): string {
  return `oy_${randomUUID().replace(/-/g, '')}`;
}

function packageNote(pkg: PaymentPackage): string {
  return pkg.kind === 'credits' ? `${pkg.credits} kredi (${pkg.key})` : `Premium ${pkg.days} gün (${pkg.key})`;
}

// ── Checkout ──────────────────────────────────────────────────────────────────────────────────────────

export class CheckoutError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'UNKNOWN_PACKAGE' | 'UNAVAILABLE',
  ) {
    super(code);
    this.name = 'CheckoutError';
  }
}

/**
 * PENDING sipariş oluşturur, paketin Checkout Link'ine `merchantOrderId` ekleyip döner. Yönetici paketi yalnız
 * ADMIN'e görünür (diğerlerine bilinmeyen paket). Link / secret tanımlı değilse satışta değil.
 */
export async function createCheckout(
  userId: string,
  packageKey: unknown,
  env: Env = process.env,
): Promise<{ url: string; merchantOrderId: string }> {
  const pkg = findPaymentPackage(packageKey);
  if (!pkg) throw new CheckoutError(400, 'UNKNOWN_PACKAGE');
  if (pkg.adminOnly) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new CheckoutError(400, 'UNKNOWN_PACKAGE');
  }
  const link = packageLink(pkg.key, env);
  if (!link || !packageSecret(pkg.key, env)) throw new CheckoutError(409, 'UNAVAILABLE');
  const merchantOrderId = newMerchantOrderId();
  await prisma.paymentOrder.create({
    data: { merchantOrderId, userId, packageKey: pkg.key, amountTRY: kurusToTryString(pkg.priceKurus), status: 'PENDING' },
  });
  return { url: checkoutUrl(link, merchantOrderId), merchantOrderId };
}

// ── Ödeme tamamlama / başarısız / iade ────────────────────────────────────────────────────────────────

/** premiumUntil = max(şimdi, mevcut) + gün. İyimser eşzamanlılık: değer okunduğundan beri değiştiyse yeniden dener. */
async function extendPremium(tx: Tx, userId: string, days: number, now: number): Promise<Date> {
  for (let i = 0; i < OPTIMISTIC_RETRIES; i++) {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
    if (!u) throw new Error('Kullanıcı bulunamadı');
    const base = Math.max(now, u.premiumUntil?.getTime() ?? 0);
    const next = new Date(base + days * DAY_MS);
    const { count } = await tx.user.updateMany({ where: { id: userId, premiumUntil: u.premiumUntil }, data: { premiumUntil: next } });
    if (count === 1) return next;
  }
  throw new Error('premiumUntil güncellenemedi (eşzamanlı değişiklik)');
}

/** premiumUntil'i gün kadar geri çeker (iade). Yoksa dokunmaz. */
async function retractPremium(tx: Tx, userId: string, days: number): Promise<Date | null> {
  for (let i = 0; i < OPTIMISTIC_RETRIES; i++) {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
    if (!u) throw new Error('Kullanıcı bulunamadı');
    if (!u.premiumUntil) return null;
    const next = new Date(u.premiumUntil.getTime() - days * DAY_MS);
    const { count } = await tx.user.updateMany({ where: { id: userId, premiumUntil: u.premiumUntil }, data: { premiumUntil: next } });
    if (count === 1) return next;
  }
  throw new Error('premiumUntil geri çekilemedi (eşzamanlı değişiklik)');
}

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
 * `hikie:{hikieOrderId}`) ya da premium uzatılır (PremiumGrant + 0 tutarlı PURCHASE satırı → kredi geçmişinde görünür).
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
      const idempotencyKey = `hikie:${hikieOrderId}`;
      if (pkg.kind === 'credits') {
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
            idempotencyKey,
            note: `Satın alma: ${packageNote(pkg)}`,
          },
        });
      } else {
        const until = await extendPremium(tx, order.userId, pkg.days, now);
        await tx.premiumGrant.create({ data: { userId: order.userId, until, source: 'PURCHASE', note: order.merchantOrderId } });
        const user = await tx.user.findUnique({ where: { id: order.userId }, select: { credits: true } });
        await tx.creditTransaction.create({
          data: {
            userId: order.userId,
            type: 'PURCHASE',
            amount: 0,
            balanceAfter: user?.credits ?? 0,
            idempotencyKey,
            note: `Satın alma: ${packageNote(pkg)} — ${until.toISOString().slice(0, 10)} tarihine kadar`,
          },
        });
      }
      return 'fulfilled';
    });
  } catch (err) {
    // Eşzamanlı ikinci istek tekil kısıta takıldı (hikieOrderId / tekrar anahtarı) → ilk istek işledi.
    if (isUniqueViolation(err)) return 'duplicate';
    throw err;
  }
}

export type RefundResult = { result: 'refunded' | 'noop'; shortfall?: number };

/**
 * İade / iptal: PAID → REFUNDED. Kredi paketinde verilen kredi geri alınır — bakiye yetmezse 0'a kadar, eksik kalan
 * not edilir (credits ≥ 0 korunur); premium paketinde premiumUntil süre kadar geri çekilir. Bir kez.
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
    if (!pkg) throw new Error(`Bilinmeyen paket: ${order.packageKey}`);
    const idempotencyKey = `hikie-refund:${order.hikieOrderId ?? order.id}`;
    if (pkg.kind === 'credits') {
      const { taken, balanceAfter } = await takeCreditsUpTo(tx, order.userId, pkg.credits);
      const shortfall = pkg.credits - taken;
      await tx.creditTransaction.create({
        data: {
          userId: order.userId,
          type: 'REFUND',
          amount: -taken,
          balanceAfter,
          idempotencyKey,
          note:
            `İade: ${packageNote(pkg)}` +
            (shortfall > 0 ? ` — bakiye yetersiz: ${taken} kredi geri alındı, ${shortfall} kredi alınamadı` : ''),
        },
      });
      return { result: 'refunded' as const, shortfall };
    }
    const until = await retractPremium(tx, order.userId, pkg.days);
    await tx.premiumGrant.create({ data: { userId: order.userId, until, source: 'REFUND', note: order.merchantOrderId } });
    const user = await tx.user.findUnique({ where: { id: order.userId }, select: { credits: true } });
    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        type: 'REFUND',
        amount: 0,
        balanceAfter: user?.credits ?? 0,
        idempotencyKey,
        note: `İade: ${packageNote(pkg)} — premium süresi geri çekildi`,
      },
    });
    return { result: 'refunded' as const, shortfall: 0 };
  });
}

// ── Callback (GET) — İMZASIZ, kredi vermez ─────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null);

const MERCHANT_ORDER_RE = /^oy_[0-9a-f]{32}$/;

export type CallbackOutcome = { location: string };

/**
 * Hikie Checkout Link callback'i: yalnız `status, isSuccess, orderId, merchantOrderId` gelir, imza YOK. Bu yüzden
 * ASLA kredi / premium vermez ve durumu değiştirmez; yalnız mevcut siparişe `callbackAt` yazar (tanılama) ve kullanıcıyı
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
async function verifyPaidEvent(w: ParsedWebhook): Promise<{ ok: true; orderDbId: string; hikieOrderId: string } | { ok: false; reason: string }> {
  if (!w.orderId) return { ok: false, reason: 'missing_order_id' };
  if (!w.merchantOrderId) return { ok: false, reason: 'no_merchant_order_id' };
  const order = await prisma.paymentOrder.findUnique({ where: { merchantOrderId: w.merchantOrderId } });
  if (!order) return { ok: false, reason: 'unknown_order' };
  if (!findPaymentPackage(order.packageKey)) return { ok: false, reason: 'unknown_package' };
  if (w.status !== 'COMPLETED') return { ok: false, reason: 'status_mismatch' };
  if (w.currency !== 'TRY') return { ok: false, reason: 'currency_mismatch' };
  if (w.totalKurus == null) return { ok: false, reason: 'amount_missing' };
  if (w.totalKurus !== tlTextToKurus(order.amountTRY.toString())) return { ok: false, reason: 'amount_mismatch' };
  return { ok: true, orderDbId: order.id, hikieOrderId: w.orderId };
}

/**
 * İmzalı webhook. Yanıt kodları (Hikie kalıcı hatada aboneliği durdurur): imza yanlış / eski / başlık eksik / gövde
 * çözümlenemez → 400; HIKIE_WEBHOOK_SECRET yok → 503; (DB / geçici hata endpoint'te 503); başarı, tekrar, tanınmayan
 * olay, test.ping VE iş kuralı reddi (tutar / para birimi / status / sipariş) → 200 (+ log, 4xx yok).
 * order.paid → doğrula + fulfillOrder (idempotent: Hikie-Webhook-Id ve orderId). order.updated REFUNDED / CANCELLED
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
    } else {
      result = `rejected:${v.reason}`;
      recorded = `order.paid:rejected:${v.reason}`;
      console.warn(`[payments] order.paid reddedildi: ${v.reason} (merchantOrderId=${w.merchantOrderId ?? '-'}, webhookId=${w.webhookId}, deneme=${w.attempt ?? '-'})`);
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
  credits: number;
  premiumUntil: string | null;
};

/**
 * Kullanıcının siparişi (yalnız kendi): merchantOrderId verilmezse son 24 saatteki en yeni sipariş. Bakiye ve
 * premium DB'den (yönlendirme parametresine güvenilmez).
 */
export async function getOrderStatusForUser(userId: string, merchantOrderId: string | null, now: number = Date.now()): Promise<OrderStatusView | null> {
  const order = merchantOrderId
    ? await prisma.paymentOrder.findFirst({ where: { merchantOrderId, userId } })
    : await prisma.paymentOrder.findFirst({
        where: { userId, createdAt: { gte: new Date(now - DAY_MS) } },
        orderBy: { createdAt: 'desc' },
      });
  if (!order) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true, premiumUntil: true } });
  return {
    merchantOrderId: order.merchantOrderId,
    packageKey: order.packageKey,
    status: order.status,
    credits: user?.credits ?? 0,
    premiumUntil: user?.premiumUntil?.toISOString() ?? null,
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
