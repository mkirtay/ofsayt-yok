/**
 * Gündem 1. sıra teklifi — haftalık açık artırma (kullanıcı kararları 2026-10-19).
 *
 * - Tek sıra. Boşken en az 1 kredi; doluyken liderin teklifinden en az 1 fazla. Lider kendi teklifini artıramaz.
 * - Teklif verilirken tutarın tamamı düşülür (defter `PIN_BID`).
 * - Sıra kaybedilince (başkası geçince ya da yönetici kaldırınca) kalınan süre BAŞLAYAN GÜN olarak sayılır (1 saat = 1 gün,
 *   en çok 7): kesinti = yukarı yuvarla(teklif × gün / 7), kalanı iade (`PIN_REFUND`). Örn. 7 kredi, 1 gün → 1 alınır, 6 iade.
 * - Hafta Pazartesi 01:00 Europe/Istanbul'da sıfırlanır; o an lider olanın teklifinin tamamı kullanılmış sayılır, iade yok.
 *   Sıfırlama tembeldir: yeni haftada önceki haftanın ACTIVE teklifi lider sayılmaz; teklif işleminde ve haftalık cron'da
 *   (`settleFinishedWeeks`) COMPLETED işaretlenir — kredi hareketi gerekmez (tutar teklifte düşülmüştü).
 *
 * Eşzamanlılık: her yazma tek işlemde `pg_advisory_xact_lock` ile sıraya girer; ayrıca DB'de haftada tek ACTIVE kısmi
 * tekil indeksi var. Kredi hiçbir zaman maç sonucuna / tahmine bağlı değildir (karar 8): teklif bir mesaj sabitleme ücretidir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { InsufficientCreditsError, debitCreditsTx, creditCreditsTx } from '@/lib/credits';

export const PIN_MESSAGE_MAX_LENGTH = 140;
/** Tek teklifte üst sınır (yanlışlıkla fazla sıfır yazmaya karşı). */
export const PIN_MAX_BID = 10_000;
export const PIN_WEEK_DAYS = 7;

const DAY_MS = 86_400_000;
const WEEK_MS = PIN_WEEK_DAYS * DAY_MS;
/** Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). */
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;
const RESET_HOUR_LOCAL = 1;
/** `pg_advisory_xact_lock(hashtext(...))` anahtarı: tüm teklif yazmaları tek sırada. */
const LOCK_KEY = 'gundem-pin-bid';

export type PinBidStatus = 'ACTIVE' | 'OUTBID' | 'REMOVED' | 'COMPLETED';

/** `now`'ın içinde bulunduğu haftanın başlangıcı: en son Pazartesi 01:00 (İstanbul), UTC `Date`. */
export function pinWeekStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday, RESET_HOUR_LOCAL);
  let start = mondayLocal - ISTANBUL_OFFSET_MS;
  if (start > now.getTime()) start -= WEEK_MS;
  return new Date(start);
}

/** Bir sonraki sıfırlama anı. */
export function pinWeekEnd(weekStart: Date): Date {
  return new Date(weekStart.getTime() + WEEK_MS);
}

/** Sıra kaybedilince: başlayan gün sayısı (1–7), kesinti (yukarı yuvarlanır) ve iade. */
export function pinCharge(amount: number, startedAt: Date, endedAt: Date): { days: number; charged: number; refunded: number } {
  const elapsed = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const days = Math.min(PIN_WEEK_DAYS, Math.max(1, Math.ceil(elapsed / DAY_MS)));
  const charged = Math.min(amount, Math.ceil((amount * days) / PIN_WEEK_DAYS));
  return { days, charged, refunded: amount - charged };
}

export function minimumBid(leaderAmount: number | null | undefined): number {
  return leaderAmount ? leaderAmount + 1 : 1;
}

export class PinBidError extends Error {
  constructor(
    readonly code: 'BID_TOO_LOW' | 'ALREADY_LEADER' | 'BID_NOT_ACTIVE',
    readonly minBid?: number,
  ) {
    super(code);
    this.name = 'PinBidError';
  }
}

type Tx = Prisma.TransactionClient;

const leaderSelect = {
  id: true,
  userId: true,
  amount: true,
  message: true,
  createdAt: true,
  weekStart: true,
  user: { select: { username: true, name: true, image: true } },
} satisfies Prisma.PinBidSelect;

export type PinLeaderRow = Prisma.PinBidGetPayload<{ select: typeof leaderSelect }>;

/** Bu haftanın lideri (önceki haftadan kalan ACTIVE sayılmaz). */
export async function currentPinLeader(now: Date = new Date(), db: Tx | typeof prisma = prisma): Promise<PinLeaderRow | null> {
  return db.pinBid.findFirst({
    where: { status: 'ACTIVE', weekStart: pinWeekStart(now) },
    select: leaderSelect,
  });
}

async function lock(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
}

/** Biten haftaların ACTIVE tekliflerini COMPLETED yapar (tamamı kullanılmış, iade yok). Kredi hareketi yok. */
async function settleFinishedWeeksTx(tx: Tx, now: Date): Promise<number> {
  const weekStart = pinWeekStart(now);
  const stale = await tx.pinBid.findMany({ where: { status: 'ACTIVE', weekStart: { lt: weekStart } }, select: { id: true, amount: true, weekStart: true } });
  for (const b of stale) {
    await tx.pinBid.update({
      where: { id: b.id },
      data: { status: 'COMPLETED', chargedAmount: b.amount, refundedAmount: 0, endedAt: pinWeekEnd(b.weekStart) },
    });
  }
  return stale.length;
}

export async function settleFinishedWeeks(now: Date = new Date()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    return settleFinishedWeeksTx(tx, now);
  });
}

/** Lideri sıradan çıkarır: başlayan gün oranında kesinti, kalanı iade. */
async function endLeaderTx(tx: Tx, leader: { id: string; userId: string; amount: number; createdAt: Date }, status: 'OUTBID' | 'REMOVED', now: Date) {
  const { charged, refunded, days } = pinCharge(leader.amount, leader.createdAt, now);
  await tx.pinBid.update({ where: { id: leader.id }, data: { status, chargedAmount: charged, refundedAmount: refunded, endedAt: now } });
  if (refunded > 0) {
    await creditCreditsTx(tx, leader.userId, refunded, {
      type: 'PIN_REFUND',
      note: `Gündem 1. sıra: ${days} gün kullanıldı, ${refunded}/${leader.amount} kredi iade`,
    });
  }
  return { userId: leader.userId, charged, refunded, days };
}

export type PlaceBidResult = {
  bidId: string;
  balance: number;
  /** Sırayı kaybeden önceki lider (bildirim için). */
  previous: { userId: string; charged: number; refunded: number } | null;
};

/**
 * Teklif verir: biten haftaları kapatır, lideri bulur, kuralları uygular, teklif tutarını düşer, önceki lideri iade ile
 * çıkarır, yeni teklifi ACTIVE yazar — hepsi tek işlemde. Hatalar: `PinBidError`, `InsufficientCreditsError`.
 */
export async function placePinBid(input: { userId: string; amount: number; message: string; now?: Date }): Promise<PlaceBidResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      await lock(tx);
      await settleFinishedWeeksTx(tx, now);
      const leader = await currentPinLeader(now, tx);
      if (leader?.userId === input.userId) throw new PinBidError('ALREADY_LEADER');
      const min = minimumBid(leader?.amount);
      if (input.amount < min) throw new PinBidError('BID_TOO_LOW', min);

      const balance = await debitCreditsTx(tx, input.userId, input.amount, { type: 'PIN_BID', note: 'Gündem 1. sıra teklifi' });
      const previous = leader ? await endLeaderTx(tx, leader, 'OUTBID', now) : null;
      const bid = await tx.pinBid.create({
        data: { userId: input.userId, weekStart: pinWeekStart(now), amount: input.amount, message: input.message, createdAt: now },
        select: { id: true },
      });
      return { bidId: bid.id, balance, previous };
    },
    { timeout: 15_000 },
  );
}

/** Yönetici kaldırması: ACTIVE teklif REMOVED, başlayan gün oranında kesinti, kalanı iade. Sıra boşalır. */
export async function removePinBid(bidId: string, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const bid = await tx.pinBid.findUnique({ where: { id: bidId }, select: { id: true, userId: true, amount: true, createdAt: true, status: true, weekStart: true } });
    if (!bid || bid.status !== 'ACTIVE' || bid.weekStart.getTime() !== pinWeekStart(now).getTime()) throw new PinBidError('BID_NOT_ACTIVE');
    return endLeaderTx(tx, bid, 'REMOVED', now);
  });
}

export { InsufficientCreditsError };
