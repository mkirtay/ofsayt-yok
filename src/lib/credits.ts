/**
 * Kredi bakiyesi yönetimi. Her hareket `CreditTransaction` tablosuna
 * denetim izi olarak kaydedilir.
 */
import { prisma } from '@/lib/prisma';

export type CreditTransactionType =
  | 'SIGNUP_BONUS'
  | 'PURCHASE'
  | 'ANALYSIS_SPEND'
  /** Premium kullanıcının kredisiz ürettiği analiz (miktar 0) — "AI Analizlerim" listesinde görünsün diye kaydedilir. */
  | 'ANALYSIS_FREE'
  | 'ADMIN_GRANT'
  | 'REFUND';

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Yetersiz kredi bakiyesi.');
    this.name = 'InsufficientCreditsError';
  }
}

export async function getUserCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  return user?.credits ?? 0;
}

/** Kredi düşer; yetersiz bakiyede `InsufficientCreditsError` fırlatır. */
export async function spendCredits(
  userId: string,
  amount: number,
  opts: { type: CreditTransactionType; matchId?: string; note?: string }
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!user || user.credits < amount) {
      throw new InsufficientCreditsError();
    }
    const balanceAfter = user.credits - amount;
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: opts.type,
        amount: -amount,
        balanceAfter,
        matchId: opts.matchId,
        note: opts.note,
      },
    });
    return balanceAfter;
  });
}

/** Kredi düşmeyen (premium) analiz üretimini 0 tutarlı kayıtla denetim izine yazar. */
export async function recordFreeAnalysis(userId: string, matchId: string, balance: number): Promise<void> {
  await prisma.creditTransaction.create({
    data: { userId, type: 'ANALYSIS_FREE', amount: 0, balanceAfter: balance, matchId, note: 'Premium: kredisiz analiz' },
  });
}

/** Kredi ekler (satın alma, admin, signup bonusu vb.). */
export async function addCredits(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  note?: string
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!user) throw new Error('Kullanıcı bulunamadı');
    const balanceAfter = user.credits + amount;
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } });
    await tx.creditTransaction.create({
      data: { userId, type, amount, balanceAfter, note },
    });
    return balanceAfter;
  });
}
