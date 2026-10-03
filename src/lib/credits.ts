/**
 * Kredi bakiyesi yönetimi. Her hareket `CreditTransaction` tablosuna denetim izi olarak kaydedilir.
 *
 * Eşzamanlılık: bakiye hiçbir yerde "oku → mutlak değer yaz" ile değişmez. Düşüm tek koşullu güncelleme
 * (`credits >= n` ise azalt), ekleme atomik artırmadır; satır kilidi işlem sonuna kadar tutulduğu için aynı işlemde
 * okunan bakiye (`balanceAfter`) doğrudur. DB'de ayrıca `CHECK (credits >= 0)` var.
 *
 * Harcama akışı (AI analiz): `reserveCredits` (PENDING, tekrar anahtarıyla) → iş → `settleCredits` (SETTLED) ya da
 * hata durumunda `refundCredits` (REFUNDED + REFUND satırı). Fonksiyon ölürse PENDING kalan harcama
 * `PENDING_REFUND_AFTER_MS` sonra `refundStalePendingSpends` ile iade edilir.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type CreditTransactionType =
  | 'SIGNUP_BONUS'
  | 'PURCHASE'
  | 'ANALYSIS_SPEND'
  /** Kredi düşmeyen (yönetici; ileride premium) analiz (miktar 0) — "AI Analizlerim" listesinde görünsün diye kaydedilir. */
  | 'ANALYSIS_FREE'
  /** Premium kullanıcının analiz açması (miktar 0; premium bitince de açık kalır — bkz. lib/analysisUnlock.ts). */
  | 'ANALYSIS_PREMIUM'
  /** Haftalık ücretsiz açma hakkı (miktar 0; anahtar `weekly-free:{ISO hafta}` → haftada bir). */
  | 'ANALYSIS_WEEKLY_FREE'
  | 'ADMIN_GRANT'
  | 'REFUND'
  /** Arkadaş daveti ödülü — yalnız davet edilenin ilk satın alımında (ödeme entegrasyonunda bağlanacak). */
  | 'REFERRAL_BONUS';
// Karar 8: hiçbir tür maç sonucuna / tahmine bağlı değil (kredi yatırıp kazanma yok) — bkz. creditPolicy.test.ts.

export type SpendStatus = 'PENDING' | 'SETTLED' | 'REFUNDED';

/** Bu süreden eski PENDING harcama iade edilir — fonksiyon süre sınırının (Vercel, en çok 5 dk) güvenle üstünde. */
export const PENDING_REFUND_AFTER_MS = 10 * 60_000;

/** AI maç analizi harcamasının tekrar anahtarı (kullanıcı başına tekil — bkz. `@@unique([userId, idempotencyKey])`). */
export function analysisIdempotencyKey(matchId: string): string {
  return `analysis:${matchId}:PRE`;
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Yetersiz kredi bakiyesi.');
    this.name = 'InsufficientCreditsError';
  }
}

/** Aynı tekrar anahtarıyla harcama zaten var (devam eden ya da tamamlanmış iş) — ikinci kez düşülmedi. */
export class DuplicateSpendError extends Error {
  constructor(readonly existing: { id: string; status: string | null; createdAt: Date }) {
    super('Bu işlem için kredi zaten düşüldü.');
    this.name = 'DuplicateSpendError';
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function getUserCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  return user?.credits ?? 0;
}

export type CreditReservation = { id: string; amount: number; balanceAfter: number };

/**
 * Krediyi atomik düşer ve harcamayı PENDING yazar. Yetersiz bakiyede `InsufficientCreditsError`, aynı tekrar
 * anahtarıyla harcama varsa `DuplicateSpendError` (işlem geri alınır, bakiye değişmez).
 */
export async function reserveCredits(
  userId: string,
  amount: number,
  opts: { type: CreditTransactionType; idempotencyKey: string; matchId?: string; note?: string },
): Promise<CreditReservation> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, credits: { gte: amount } },
        data: { credits: { decrement: amount } },
      });
      if (count === 0) throw new InsufficientCreditsError();
      // Satır kilidi bu işlemde → okunan bakiye kendi düşümümüzden sonraki değer.
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const balanceAfter = user?.credits ?? 0;
      const row = await tx.creditTransaction.create({
        data: {
          userId,
          type: opts.type,
          amount: -amount,
          balanceAfter,
          matchId: opts.matchId,
          note: opts.note,
          idempotencyKey: opts.idempotencyKey,
          status: 'PENDING',
        },
        select: { id: true },
      });
      return { id: row.id, amount, balanceAfter };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.creditTransaction.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: opts.idempotencyKey } },
      select: { id: true, status: true, createdAt: true },
    });
    if (!existing) throw err;
    throw new DuplicateSpendError(existing);
  }
}

/** İş tamamlandı: PENDING → SETTLED. İade edilmişse (geç biten istek) `false` — çağıran loglar. */
export async function settleCredits(reservationId: string): Promise<boolean> {
  const { count } = await prisma.creditTransaction.updateMany({
    where: { id: reservationId, status: 'PENDING' },
    data: { status: 'SETTLED' },
  });
  return count === 1;
}

/**
 * PENDING harcamayı iade eder: REFUNDED işaretler (tekrar anahtarı serbest kalır), bakiyeye ekler, REFUND satırı yazar.
 * En fazla bir kez: koşullu durum güncellemesi + `refundOfId` tekil. Zaten SETTLED / REFUNDED ise `null`.
 * @returns iade sonrası bakiye
 */
export async function refundCredits(reservationId: string, reason: string): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const spend = await tx.creditTransaction.findUnique({
      where: { id: reservationId },
      select: { id: true, userId: true, amount: true, matchId: true, idempotencyKey: true },
    });
    if (!spend || spend.amount >= 0) return null;
    const { count } = await tx.creditTransaction.updateMany({
      where: { id: spend.id, status: 'PENDING' },
      data: {
        status: 'REFUNDED',
        idempotencyKey: spend.idempotencyKey ? `${spend.idempotencyKey}:refunded:${spend.id}` : null,
      },
    });
    if (count === 0) return null;
    const user = await tx.user.update({
      where: { id: spend.userId },
      data: { credits: { increment: -spend.amount } },
      select: { credits: true },
    });
    await tx.creditTransaction.create({
      data: {
        userId: spend.userId,
        type: 'REFUND',
        amount: -spend.amount,
        balanceAfter: user.credits,
        matchId: spend.matchId,
        note: reason,
        refundOfId: spend.id,
      },
    });
    return user.credits;
  });
}

/**
 * `PENDING_REFUND_AFTER_MS`'den eski PENDING harcamaları iade eder (fonksiyon düşüm ile kayıt arasında öldüyse).
 * Kullanıcının bir sonraki analiz isteğinde (yalnız onun) ve günlük cron'da (herkes) çalışır.
 * @returns iade edilen harcama sayısı
 */
export async function refundStalePendingSpends(opts: { userId?: string; now?: number } = {}): Promise<number> {
  const cutoff = new Date((opts.now ?? Date.now()) - PENDING_REFUND_AFTER_MS);
  const stale = await prisma.creditTransaction.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff }, ...(opts.userId ? { userId: opts.userId } : {}) },
    select: { id: true },
    take: 100,
  });
  let refunded = 0;
  for (const s of stale) {
    if ((await refundCredits(s.id, 'Yarım kalan işlem: otomatik iade')) !== null) refunded += 1;
  }
  return refunded;
}

/** Kredi düşmeyen (yönetici; ileride premium) analiz üretimini 0 tutarlı kayıtla denetim izine yazar. */
export async function recordFreeAnalysis(userId: string, matchId: string, balance: number): Promise<void> {
  await prisma.creditTransaction.create({
    data: { userId, type: 'ANALYSIS_FREE', amount: 0, balanceAfter: balance, matchId, note: 'Kredisiz analiz' },
  });
}

/**
 * Yeni hesabın başlangıç kredisini deftere `SIGNUP_BONUS` olarak işler — hem e-posta/şifre kaydı hem OAuth (Google)
 * ilk girişi BURAYI çağırır. Bakiye `User.credits` DB varsayılanından gelir (tekrar eklenmez); bu fonksiyon yalnızca
 * denetim izini yazar. İdempotent: kullanıcı satırı `FOR UPDATE` ile kilitlenir, zaten SIGNUP_BONUS varsa hiçbir şey yapmaz.
 * @returns kayıt yazıldıysa `true`
 */
export async function recordSignupBonus(userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const existing = await tx.creditTransaction.findFirst({
      where: { userId, type: 'SIGNUP_BONUS' },
      select: { id: true },
    });
    if (existing) return false;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!user) return false;
    await tx.creditTransaction.create({
      data: {
        userId,
        type: 'SIGNUP_BONUS',
        amount: user.credits,
        balanceAfter: user.credits,
        note: 'Kayıt hoşgeldin bonusu',
      },
    });
    return true;
  });
}

/**
 * Kredi ekler (satın alma, admin vb.; negatif miktar = admin düşümü). Atomik: artırma tek UPDATE, düşüm koşullu
 * (bakiye eksiye inmez → `InsufficientCreditsError`).
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  note?: string
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    let balanceAfter: number;
    if (amount >= 0) {
      const user = await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: amount } },
        select: { credits: true },
      });
      balanceAfter = user.credits;
    } else {
      const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) throw new Error('Kullanıcı bulunamadı');
      const { count } = await tx.user.updateMany({
        where: { id: userId, credits: { gte: -amount } },
        data: { credits: { decrement: -amount } },
      });
      if (count === 0) throw new InsufficientCreditsError();
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      balanceAfter = user?.credits ?? 0;
    }
    await tx.creditTransaction.create({
      data: { userId, type, amount, balanceAfter, note },
    });
    return balanceAfter;
  });
}
