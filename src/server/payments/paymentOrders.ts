/**
 * Hikie ödeme siparişleri (v1) — checkout, callback, webhook, iade.
 *
 * Kural: kredi / premium kararı YALNIZ imzalı callback ya da imzalı webhook'tan verilir; tarayıcı yönlendirmesi
 * (/odeme/tamamlandi) yalnız durumu okur. Her paketin secret'ı ayrı: callback imzası siparişin KENDİ paketinin
 * secret'ıyla doğrulanır (başka paketin secret'ıyla atılmış imza geçmez).
 *
 * İdempotentlik: sipariş durumu koşullu güncellenir (PENDING/FAILED → PAID yalnız bir kez), `hikieOrderId` tekil,
 * kredi defteri satırının tekrar anahtarı `hikie:{hikieOrderId}` (kullanıcı başına tekil). Aynı ödeme için ikinci
 * callback / webhook hiçbir şey yapmadan 200 alır.
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
import { timestampFresh, verifyCallbackSignature, verifyWebhookSignature } from './hikieSignature';

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

/** Ödeme başarısız: yalnız PENDING → FAILED (ödenmiş sipariş etkilenmez). */
export async function markOrderFailed(orderId: string): Promise<boolean> {
  const { count } = await prisma.paymentOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'FAILED' } });
  return count === 1;
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

// ── Callback (GET) ────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null);

/**
 * Hikie callback'i: merchantOrderId → sipariş → o paketin secret'ıyla imza → zaman damgası (≤ 5 dk) → success ise
 * tamamla, failed ise FAILED. Tekrar gelen istek işlemsiz 200. Geçersiz / eski imza 401.
 */
export async function handleHikieCallback(
  query: Record<string, unknown>,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<HandlerResult> {
  const status = str(query.status);
  const orderId = str(query.orderId);
  const merchantOrderId = str(query.merchantOrderId);
  const timestamp = str(query.timestamp);
  const signature = str(query.signature);
  if (!status || !orderId || !merchantOrderId || !timestamp || !signature) return { status: 400, body: { error: 'missing_params' } };
  if (status !== 'success' && status !== 'failed') return { status: 400, body: { error: 'bad_status' } };

  const order = await prisma.paymentOrder.findUnique({ where: { merchantOrderId } });
  if (!order) return { status: 404, body: { error: 'unknown_order' } };
  const secret = packageSecret(order.packageKey, env);
  if (!secret) return { status: 500, body: { error: 'not_configured' } };
  if (!verifyCallbackSignature(secret, { timestamp, orderId, status, signature })) return { status: 401, body: { error: 'bad_signature' } };
  if (!timestampFresh(timestamp, now)) return { status: 401, body: { error: 'stale' } };

  if (status === 'success') {
    const result = await fulfillOrder(order.id, orderId, now);
    return { status: 200, body: { ok: true, result } };
  }
  const changed = await markOrderFailed(order.id);
  return { status: 200, body: { ok: true, result: changed ? 'failed' : 'duplicate' } };
}

// ── Webhook (POST) ────────────────────────────────────────────────────────────────────────────────────

const header = (h: Record<string, string | string[] | undefined>, name: string) => str(h[name.toLowerCase()]);

/** Gövdeden alan: önce data / order alt nesnesi, sonra kök (yük biçimi Hikie webhook onayıyla kesinleşecek). */
function pick(body: Record<string, unknown>, keys: string[]): string | null {
  const scopes = [body.data, body.order, body].filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  for (const scope of scopes) {
    for (const k of keys) {
      const v = scope[k];
      if (typeof v === 'string' && v) return v;
      if (typeof v === 'number') return String(v);
    }
  }
  return null;
}

async function findOrder(merchantOrderId: string | null, hikieOrderId: string | null) {
  if (merchantOrderId) {
    const o = await prisma.paymentOrder.findUnique({ where: { merchantOrderId } });
    if (o) return o;
  }
  return hikieOrderId ? prisma.paymentOrder.findUnique({ where: { hikieOrderId } }) : null;
}

/**
 * İmzalı webhook: ham gövde + Hikie-Timestamp ile imza, ≤ 5 dk, Hikie-Webhook-Id tekrar koruması.
 * order.paid → tamamla (callback gelmediyse); order.updated + REFUNDED / CANCELLED → iade. Diğerleri yok sayılır.
 * HIKIE_WEBHOOK_SECRET yoksa 503.
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
  const webhookId = header(headers, 'hikie-webhook-id');
  if (!timestamp || !signature || !webhookId) return { status: 400, body: { error: 'missing_headers' } };
  if (!verifyWebhookSignature(secret, timestamp, rawBody, signature)) return { status: 401, body: { error: 'bad_signature' } };
  if (!timestampFresh(timestamp, now)) return { status: 401, body: { error: 'stale' } };

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: 'bad_json' } };
  }

  if (await prisma.paymentWebhookEvent.findUnique({ where: { id: webhookId } })) {
    return { status: 200, body: { ok: true, result: 'duplicate' } };
  }

  const event = header(headers, 'hikie-event') ?? (typeof body.event === 'string' ? body.event : null) ?? '';
  const merchantOrderId = pick(body, ['merchantOrderId']);
  const hikieOrderId = pick(body, ['orderId', 'invoiceId']) ?? pick({ data: body.data, order: body.order }, ['id']);
  const orderStatus = (pick(body, ['status']) ?? '').toUpperCase();

  let result = 'ignored';
  if (event === 'order.paid' && hikieOrderId) {
    const order = await findOrder(merchantOrderId, hikieOrderId);
    result = order ? await fulfillOrder(order.id, hikieOrderId, now) : 'unknown_order';
  } else if (event === 'order.updated' && (orderStatus === 'REFUNDED' || orderStatus === 'CANCELLED')) {
    const order = await findOrder(merchantOrderId, hikieOrderId);
    result = order ? (await refundOrder(order.id, now)).result : 'unknown_order';
  }

  // İşlendikten sonra kaydedilir: kayıt başarısız olsa bile yeniden teslimat idempotent (durum koşulları).
  try {
    await prisma.paymentWebhookEvent.create({ data: { id: webhookId, event: event || 'unknown' } });
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
